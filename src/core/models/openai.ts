import OpenAI from "openai";
import type { GenerateChunk, GenerateParams, ModelProvider } from "../types";
import { redactSecrets } from "../security";
import { getConfig } from "../config";
import { log } from "../log";
import { AetherError } from "../errors";

function userSafeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "provider error";
  if (/api key|incorrect api key|invalid_api_key|401/i.test(raw)) {
    return "The AI service rejected the configured credentials.";
  }
  if (/rate limit|429/i.test(raw)) {
    return "The AI service is rate limiting requests. Try again shortly.";
  }
  if (/timeout|aborted|abort/i.test(raw)) {
    return "The AI service timed out.";
  }
  if (/model/i.test(raw) && /not found|does not exist|invalid/i.test(raw)) {
    return "The configured AI model is not available. Set AI_MODEL_DEFAULT to a model your account can use.";
  }
  return "The AI service is temporarily unavailable. Please try again.";
}

function mergeAbort(params: GenerateParams): AbortSignal {
  const timeout = params.timeoutMs ?? getConfig().timeoutMs;
  const t = AbortSignal.timeout(timeout);
  if (!params.abort) return t;
  return AbortSignal.any([params.abort, t]);
}

export function createOpenAIProvider(): ModelProvider | null {
  const cfg = getConfig();
  if (!cfg.openaiApiKey) return null;

  const client = new OpenAI({
    apiKey: cfg.openaiApiKey,
    baseURL: cfg.openaiBaseUrl,
    timeout: cfg.timeoutMs,
    maxRetries: 0,
  });

  return {
    id: "openai",
    name: "OpenAI",
    tiers: ["fast", "balanced", "reasoning"],
    supportsVision: () => true,
    supportsTools: () => true,
    supportsAudio: () => true,
    async healthCheck() {
      return { ok: true, configured: true, mock: false };
    },
    async *generate(params: GenerateParams): AsyncIterable<GenerateChunk> {
      const started = Date.now();
      const model =
        params.model && params.model !== "aether-engine-v1"
          ? params.model
          : cfg.models.default;
      const signal = mergeAbort(params);
      const input = params.assembled.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      let attempt = 0;
      const max = Math.max(0, cfg.maxRetries);
      while (true) {
        attempt += 1;
        try {
          const stream = await client.responses.create(
            {
              model,
              instructions: params.assembled.systemText,
              input,
              stream: true,
              store: false,
              temperature: params.tier === "reasoning" ? 0.4 : 0.7,
            },
            { signal },
          );

          let usageFromProvider: { inputTokens: number; outputTokens: number } | null = null;
          for await (const event of stream) {
            if (signal.aborted) {
              yield { type: "error", error: "cancelled" };
              return;
            }
            const type = (event as { type?: string }).type;
            if (type === "response.output_text.delta") {
              const delta = (event as { delta?: string }).delta || "";
              if (delta) yield { type: "token", text: redactSecrets(delta) };
            } else if (type === "response.completed") {
              const u = (event as { response?: { usage?: { input_tokens?: number; output_tokens?: number } } })
                .response?.usage;
              if (u && typeof u.input_tokens === "number") {
                usageFromProvider = {
                  inputTokens: u.input_tokens,
                  outputTokens: u.output_tokens ?? 0,
                };
              }
            } else if (type === "error") {
              yield { type: "error", error: "The AI service is temporarily unavailable. Please try again." };
              return;
            }
          }

          yield {
            type: "usage",
            usage: {
              inputTokens: usageFromProvider?.inputTokens ?? 0,
              outputTokens: usageFromProvider?.outputTokens ?? 0,
              latencyMs: Date.now() - started,
              model,
              provider: "openai",
              estimated: !usageFromProvider,
            },
          };
          yield { type: "done" };
          return;
        } catch (e) {
          const aborted = signal.aborted || (e instanceof Error && e.name === "AbortError");
          if (aborted) {
            yield { type: "error", error: "cancelled" };
            return;
          }
          const msg = e instanceof Error ? e.message : "provider error";
          const transient = /429|500|502|503|504|ECONNRESET|ETIMEDOUT|network/i.test(msg);
          if (transient && attempt <= max + 1) {
            const delay = Math.min(2000, 250 * 2 ** (attempt - 1));
            log("warn", "openai.retry", { attempt, delay });
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          log("error", "openai.generate_failed", { attempt });
          yield { type: "error", error: userSafeProviderError(e) };
          return;
        }
      }
    },
    async generateStructured() {
      throw new AetherError("not_supported", "Structured generation is not enabled", 501);
    },
  };
}

/** @deprecated Use createOpenAIProvider. Kept name for existing imports. */
export const createOpenAICompatibleProvider = createOpenAIProvider;
