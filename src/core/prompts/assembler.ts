import {
  OUTPUT_RULES,
  PLATFORM_SECURITY,
  PRIVACY_RULES,
  SYSTEM_RULES,
  sanitizeSkillInstructions,
  sanitizeUntrusted,
  wrapExternalContext,
} from "../security";
import type {
  AssembledPrompt,
  Attachment,
  ChatMessage,
  ExternalContext,
  ModeDefinition,
  PromptLayer,
  Skill,
} from "../types";
import { MAX_CONTEXT_CHARS, MAX_FILE_CHARS, MAX_HISTORY_MESSAGES } from "../types";

function clippedHistory(history: ChatMessage[]): ChatMessage[] {
  const sliced = history
    .filter((h) => h.role === "user" || h.role === "assistant")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ ...m }));
  let total = sliced.reduce((n, m) => n + (m.content?.length || 0), 0);
  while (sliced.length > 2 && total > MAX_CONTEXT_CHARS) {
    const gone = sliced.shift();
    total -= gone?.content.length ?? 0;
  }
  return sliced;
}

export interface AssembleInput {
  mode: ModeDefinition;
  skill?: Skill | null;
  developerRules?: string;
  userCustomInstructions?: string | null;
  history: ChatMessage[];
  userMessage: string;
  attachments: Attachment[];
  externalContext?: ExternalContext;
  model: string;
  toolResultText?: string;
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const layers: PromptLayer[] = [];

  layers.push({ layer: "platform_security", trusted: true, content: PLATFORM_SECURITY });
  layers.push({ layer: "privacy", trusted: true, content: PRIVACY_RULES });
  layers.push({ layer: "system", trusted: true, content: SYSTEM_RULES });
  if (input.developerRules) {
    layers.push({ layer: "developer", trusted: true, content: input.developerRules });
  }
  layers.push({
    layer: "mode",
    trusted: true,
    content: `MODE: ${input.mode.name} (${input.mode.id})\n${input.mode.instructions}\nOutput format: ${input.mode.outputFormat}\nSafety: ${input.mode.safetyRules.join("; ")}`,
  });

  if (input.skill) {
    const clean = sanitizeSkillInstructions(input.skill.instructions);
    layers.push({
      layer: "skill",
      trusted: true,
      content: clean.ok
        ? `SKILL: ${input.skill.name} v${input.skill.version}\n${clean.text}\nSkill safety: ${input.skill.safetyRules.join("; ")}`
        : `SKILL: ${input.skill.name} — instructions blocked by security (${clean.reasons.join(", ")}). Continue with mode rules only.`,
    });
  }

  if (input.userCustomInstructions?.trim()) {
    layers.push({
      layer: "user_custom",
      trusted: false,
      content: sanitizeUntrusted(
        input.userCustomInstructions,
        "USER_CUSTOM_INSTRUCTIONS",
      ),
    });
  }

  if (input.toolResultText) {
    layers.push({
      layer: "tool_results",
      trusted: true,
      content: `TRUSTED TOOL RESULTS (platform tools):\n${input.toolResultText}`,
    });
  }

  if (input.externalContext && Object.keys(input.externalContext).length) {
    layers.push({
      layer: "external_context",
      trusted: false,
      content: wrapExternalContext(input.externalContext),
    });
  }

  if (input.attachments.length) {
    const docs = input.attachments
      .map((a) => {
        const text = (a.extractedText || "(binary / no text)").slice(0, MAX_FILE_CHARS);
        return `${a.filename} (${a.mime}):\n${text}`;
      })
      .join("\n\n");
    layers.push({
      layer: "document",
      trusted: false,
      content: sanitizeUntrusted(docs, "DOCUMENT"),
    });
  }

  const systemText = [
    ...layers.filter((l) => l.trusted).map((l) => l.content),
    OUTPUT_RULES,
    ...layers.filter((l) => !l.trusted && l.layer !== "user_message").map((l) => l.content),
  ].join("\n\n---\n\n");

  const messages: AssembledPrompt["messages"] = [];
  for (const h of clippedHistory(input.history)) {
    if (h.role === "user" || h.role === "assistant") {
      messages.push({
        role: h.role,
        content:
          h.role === "user"
            ? sanitizeUntrusted(h.content, "HISTORY_USER")
            : h.content,
      });
    }
  }
  messages.push({
    role: "user",
    content: sanitizeUntrusted(input.userMessage, "USER_MESSAGE"),
  });

  return {
    layers,
    systemText,
    messages,
    visibleToUser: {
      mode: input.mode.id,
      skill: input.skill?.name,
      skillVersion: input.skill?.version,
      customInstructions: Boolean(input.userCustomInstructions?.trim()),
      tools: input.skill?.allowedTools ?? input.mode.allowedTools,
      files: input.attachments.map((a) => a.filename),
      model: input.model,
    },
  };
}

export function titleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New Chat";
  const stop = new Set([
    "the",
    "a",
    "an",
    "please",
    "help",
    "me",
    "my",
    "i",
    "to",
    "for",
    "and",
    "of",
    "in",
    "on",
    "with",
  ]);
  const words = cleaned
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(" ")
    .filter((w) => w && !stop.has(w.toLowerCase()));
  const slice = (words.length ? words : cleaned.split(" ")).slice(0, 6).join(" ");
  const titled = slice.charAt(0).toUpperCase() + slice.slice(1);
  return titled.slice(0, 48) || "New Chat";
}
