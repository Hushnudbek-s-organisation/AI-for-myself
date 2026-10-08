import { AetherError } from "./errors";
import { getMode } from "./modes";
import { assemblePrompt, titleFromMessage } from "./prompts/assembler";
import { isAllowedModel, resolveProvider } from "./models/manager";
import { providerFailureMessage, userSafeFailureMessage } from "./models/shared";
import { pickToolsForRequest, runTool } from "./tools/index";
import { validateOutput } from "./validator";
import { sanitizeSkillInstructions } from "./security";
import { assertRuntimeConfig, getConfig } from "./config";
import { log, requestId as makeRequestId } from "./log";
import type {
  Attachment,
  AuthContext,
  ChatRequest,
  ChatResponse,
  GenerateChunk,
  ModeId,
  Skill,
  Source,
  ToolCall,
  ToolId,
  Usage,
} from "./types";
import { MAX_EXTERNAL_CONTEXT_CHARS, MAX_HISTORY_MESSAGES, MAX_TOOL_CALLS } from "./types";
import { conversations, files, instructions, messages, projects, rules, skills, usage } from "@/db/repos";
import { parseJson } from "@/db/index";

const inflight = new Set<string>();

function failureCode(err: unknown): string {
  if (err instanceof AetherError) return err.code;
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /^[a-z0-9_.-]{1,64}$/i.test(code)) return code;
  }
  return "provider_error";
}

function resolveSkill(auth: AuthContext, req: ChatRequest, convSkill?: string | null): Skill | undefined {
  const key = req.skillId || req.skill || convSkill || undefined;
  if (!key) return undefined;
  const s = skills.get(key, auth.userId);
  if (!s) return undefined;
  if (!s.enabled || s.status === "disabled" || s.status === "draft") return undefined;
  const check = sanitizeSkillInstructions(s.instructions);
  if (!check.ok) return undefined;
  return s;
}

function allowedTools(modeTools: ToolId[], skill?: Skill | null): ToolId[] {
  if (!skill) return modeTools;
  const skillSet = new Set(skill.allowedTools);
  return modeTools.filter((t) => skillSet.has(t));
}

function enforceProject(auth: AuthContext, modeId: ModeId, skill: Skill | undefined, model: string) {
  if (auth.kind !== "api_key" || !auth.projectId) return;
  const project = projects.get(auth.projectId);
  if (!project) throw new AetherError("forbidden", "Project not found", 403);
  const modes = parseJson<string[]>(project.enabled_modes, []);
  if (modes.length && !modes.includes(modeId)) {
    throw new AetherError("forbidden", "Mode is not enabled for this project", 403);
  }
  const skillAllow = parseJson<string[]>(project.enabled_skills, []);
  if (skill && skillAllow.length && !skillAllow.includes(skill.slug) && !skillAllow.includes(skill.id)) {
    throw new AetherError("forbidden", "Skill is not enabled for this project", 403);
  }
  const models = parseJson<string[]>(project.allowed_models, []);
  if (!isAllowedModel(model, models)) {
    throw new AetherError("forbidden", "Model is not enabled for this project", 403);
  }
}

export async function ensureConversation(auth: AuthContext, req: ChatRequest) {
  if (req.conversationId) {
    const conv = conversations.get(req.conversationId, auth.userId);
    if (!conv) {
      throw new AetherError("not_found", "Conversation not found", 404);
    }
    return conv;
  }
  const skill = resolveSkill(auth, req);
  return conversations.create({
    userId: auth.userId,
    projectId: auth.projectId,
    mode: req.mode || skill?.mode || "general",
    skillId: skill?.id,
    skillVersion: skill?.version,
    model: req.model,
    title: "New Chat",
  });
}

export interface GatewayStreamEvent {
  type: "meta" | "token" | "tool" | "source" | "usage" | "done" | "error";
  conversationId?: string;
  messageId?: string;
  title?: string;
  text?: string;
  tool?: ToolCall;
  source?: Source;
  usage?: Usage;
  response?: ChatResponse;
  error?: string;
  requestId?: string;
  mock?: boolean;
  visible?: Record<string, unknown>;
}

export async function* runChat(
  auth: AuthContext,
  req: ChatRequest,
  opts: { abort?: AbortSignal } = {},
): AsyncGenerator<GatewayStreamEvent> {
  assertRuntimeConfig();
  const rid = makeRequestId();
  if (!req.message || !req.message.trim()) {
    throw new AetherError("bad_request", "message is required", 400);
  }

  if (req.context) {
    const size = JSON.stringify(req.context).length;
    if (size > MAX_EXTERNAL_CONTEXT_CHARS) {
      throw new AetherError("bad_request", "External context too large", 400);
    }
  }

  const conv = await ensureConversation(auth, req);
  if (inflight.has(conv.id)) {
    throw new AetherError("conflict", "This conversation is already generating a reply", 409);
  }
  inflight.add(conv.id);

  try {
    const skill = resolveSkill(auth, req, conv.skillId);
    const modeId = (req.mode || skill?.mode || conv.mode || "general") as ModeId;
    const mode = getMode(modeId);
    const resolved = await resolveProvider(req.model || conv.model);
    const { provider, providerId: activeProviderId, mock, catalogId } = resolved;
    const model = resolved.model;
    enforceProject(auth, modeId, skill, catalogId);
    if (req.model && catalogId !== conv.model) {
      conversations.update(conv.id, auth.userId, { model: catalogId });
    }

    if (req.regenerateOf) {
      const original = messages.get(req.regenerateOf);
      if (!original || original.conversationId !== conv.id) {
        throw new AetherError("not_found", "Message to regenerate not found", 404);
      }
      messages.deleteAfter(conv.id, original.createdAt);
    }

    if (req.editOf) {
      const original = messages.get(req.editOf);
      if (!original || original.conversationId !== conv.id) {
        throw new AetherError("not_found", "Message to edit not found", 404);
      }
      messages.deleteAfter(conv.id, original.createdAt);
    }

    const historyBefore = messages.list(conv.id).slice(-MAX_HISTORY_MESSAGES);

    const attachments: Attachment[] = [];
    if (req.files?.length) {
      for (const f of req.files) {
        if (f.id) {
          const owned = files.get(f.id, auth.userId);
          if (owned) attachments.push(owned);
        } else if (f.extractedText || f.filename) {
          attachments.push(f);
        }
      }
    }

    const userMsg = messages.create({
      conversationId: conv.id,
      role: "user",
      content: req.message,
      rawContent: req.message,
      mode: modeId,
      skillId: skill?.id,
      skillVersion: skill?.version,
      metadata: {
        attachments: attachments.map((a) => a.id),
        editOf: req.editOf,
        requestId: rid,
      },
    });

    const toolsAllowed = allowedTools(mode.allowedTools, skill);
    const picked = pickToolsForRequest({
      allowed: toolsAllowed,
      message: req.message,
      modeId,
      attachments,
    }).slice(0, MAX_TOOL_CALLS);

    const toolCalls: ToolCall[] = [];
    const sources: Source[] = [];
    const toolTexts: string[] = [];

    for (const t of picked) {
      const input: Record<string, unknown> = {
        query: req.message,
        text: attachments.map((a) => a.extractedText || "").join("\n") || req.message,
        country: req.context?.country,
        visaType: req.context?.visaType,
      };
      const result = runTool(t, input, attachments);
      toolCalls.push(result.call);
      sources.push(...result.sources);
      toolTexts.push(`### ${t}\n${result.text}`);
      yield { type: "tool", tool: result.call, conversationId: conv.id, requestId: rid };
      for (const s of result.sources) {
        yield { type: "source", source: s, conversationId: conv.id, requestId: rid };
      }
    }

    const assembled = assemblePrompt({
      mode,
      skill,
      developerRules: rules.enabledText(),
      userCustomInstructions: instructions.asText(auth.userId),
      history: historyBefore,
      userMessage: req.message,
      attachments,
      externalContext: req.context,
      model: catalogId,
      toolResultText: toolTexts.join("\n\n") || undefined,
    });

    const title = conv.title === "New Chat" ? titleFromMessage(req.message) : conv.title;

    yield {
      type: "meta",
      conversationId: conv.id,
      messageId: userMsg.id,
      title,
      visible: assembled.visibleToUser,
      requestId: rid,
      mock,
    };

    let full = "";
    let lastUsage: Usage | undefined;
    const started = Date.now();
    let failed = false;
    let failMessage = "";

    try {
      for await (const chunk of provider.generate({
        assembled,
        mode,
        skill,
        toolsAllowed,
        model,
        tier: "balanced",
        attachments,
        externalContext: req.context,
        abort: opts.abort,
        timeoutMs: getConfig().timeoutMs,
      }) as AsyncIterable<GenerateChunk>) {
        if (opts.abort?.aborted) {
          failed = true;
          failMessage = "cancelled";
          break;
        }
        if (chunk.type === "token" && chunk.text) {
          full += chunk.text;
          yield { type: "token", text: chunk.text, conversationId: conv.id, requestId: rid };
        } else if (chunk.type === "tool" && chunk.tool) {
          yield { type: "tool", tool: chunk.tool, conversationId: conv.id, requestId: rid };
        } else if (chunk.type === "usage" && chunk.usage) {
          lastUsage = chunk.usage;
        } else if (chunk.type === "error") {
          failed = true;
          failMessage = chunk.error || providerFailureMessage(activeProviderId, "unavailable");
        }
      }
    } catch (e) {
      failed = true;
      failMessage = userSafeFailureMessage(e, activeProviderId);
      log("error", "gateway.generate", {
        requestId: rid,
        conversationId: conv.id,
        code: failureCode(e),
      });
    }

    if (failed || opts.abort?.aborted) {
      const err = failMessage || "cancelled";
      usage.write({
        userId: auth.userId,
        projectId: auth.projectId ?? undefined,
        conversationId: conv.id,
        skillId: skill?.id,
        mode: modeId,
        model,
        error: err,
        latencyMs: Date.now() - started,
      });
      yield { type: "error", error: err, conversationId: conv.id, requestId: rid };
      return;
    }

    full = validateOutput(full, modeId);
    const u: Usage = lastUsage ?? {
      inputTokens: 0,
      outputTokens: Math.round(full.length / 4),
      latencyMs: Date.now() - started,
      model,
      provider: provider.id,
      estimated: true,
    };

    const assistant = messages.create({
      conversationId: conv.id,
      role: "assistant",
      content: full,
      mode: modeId,
      skillId: skill?.id,
      skillVersion: skill?.version,
      model,
      usage: u,
      metadata: {
        sources,
        toolCalls,
        visible: assembled.visibleToUser,
        requestId: rid,
        mock,
      },
    });

    conversations.update(conv.id, auth.userId, {
      title,
      mode: modeId,
      skillId: skill?.id ?? null,
      skillVersion: skill?.version ?? null,
      model: catalogId,
      lastMessage: full.slice(0, 180),
    });

    usage.write({
      userId: auth.userId,
      projectId: auth.projectId ?? undefined,
      conversationId: conv.id,
      skillId: skill?.id,
      mode: modeId,
      model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      latencyMs: u.latencyMs,
    });

    const response: ChatResponse = {
      id: assistant.id,
      message: full,
      conversationId: conv.id,
      mode: modeId,
      skill: skill?.slug,
      skillVersion: skill?.version,
      sources,
      usage: u,
      toolCalls,
      title,
      requestId: rid,
      provider: provider.id,
      mock,
    };
    yield { type: "usage", usage: u, conversationId: conv.id, requestId: rid };
    yield { type: "done", response, conversationId: conv.id, messageId: assistant.id, requestId: rid, mock };
  } finally {
    inflight.delete(conv.id);
  }
}

export async function runChatSync(
  auth: AuthContext,
  req: ChatRequest,
  opts: { abort?: AbortSignal } = {},
): Promise<ChatResponse> {
  let response: ChatResponse | undefined;
  let error: string | undefined;
  for await (const ev of runChat(auth, req, opts)) {
    if (ev.type === "done" && ev.response) response = ev.response;
    if (ev.type === "error") error = ev.error;
  }
  if (error) throw new AetherError("generation_error", error, 502);
  if (!response) throw new AetherError("generation_error", "Empty response", 502);
  return response;
}
