import type { GenerateChunk, GenerateParams, ModelProvider } from "../types";
import { redactSecrets } from "../security";
import { getConfig } from "../config";
import { log } from "../log";
import { AetherError } from "../errors";
import {
  backoff,
  httpStatusError,
  isRetryableProviderError,
  iterateSseJson,
  mergeAbort,
  requireWireModel,
  safeErrorText,
  userSafeProviderError,
} from "./shared";

export function grokDeltaText(event: unknown): string {
  const obj = event as { choices?: Array<{ delta?: { content?: string | null } }> };
  return obj.choices?.[0]?.delta?.content || "";
}

export function grokUsage(event: unknown): { inputTokens: number; outputTokens: number } | null {
  const u = (event as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (!u || typeof u.prompt_tokens !== "number") return null;
  return { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens ?? 0 };
}

export function createGrokProvider(): ModelProvider | null {
  const cfg = getConfig();
  if (!cfg.grok.apiKey) return null;
  const base = cfg.grok.baseUrl;
  const apiKey = cfg.grok.apiKey;

  return {
    id: "grok",
    name: "Grok",
    tiers: ["fast", "balanced", "reasoning"],
    supportsVision: () => false,
    supportsTools: () => false,
    supportsAudio: () => false,
    async healthCheck() {
      return { ok: true, configured: true, mock: false };
    },
    async *generate(params: GenerateParams): AsyncIterable<GenerateChunk> {
      const started = Date.now();
      // The router already resolved a free-tier id this key can call. Never guess here.
      const model = requireWireModel(params.model, "grok");
      const signal = mergeAbort(params.timeoutMs, params.abort);
      const messages = [
        { role: "system" as const, content: params.assembled.systemText },
        ...params.assembled.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      let attempt = 0;
      const max = Math.max(0, cfg.maxRetries);
      while (true) {
        attempt += 1;
        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages,
              stream: true,
              stream_options: { include_usage: true },
              temperature: params.tier === "reasoning" ? 0.4 : 0.7,
            }),
            signal,
          });
          if (!res.ok) {
            const body = await safeErrorText(res);
            const msg = httpStatusError(res.status, body, "grok");
            const transient =
              !/cannot use that model|rejected the configured credentials/.test(msg) &&
              (res.status >= 500 || res.status === 429);
            if (transient && attempt <= max + 1) {
              await backoff(attempt);
              continue;
            }
            yield { type: "error", error: msg };
            return;
          }

          let usageFromProvider: { inputTokens: number; outputTokens: number } | null = null;
          for await (const event of iterateSseJson(res)) {
            if (signal.aborted) {
              yield { type: "error", error: "cancelled" };
              return;
            }
            const delta = grokDeltaText(event);
            if (delta) yield { type: "token", text: redactSecrets(delta) };
            const u = grokUsage(event);
            if (u) usageFromProvider = u;
          }

          yield {
            type: "usage",
            usage: {
              inputTokens: usageFromProvider?.inputTokens ?? 0,
              outputTokens: usageFromProvider?.outputTokens ?? 0,
              latencyMs: Date.now() - started,
              model,
              provider: "grok",
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
          if (isRetryableProviderError(e) && attempt <= max + 1) {
            await backoff(attempt);
            continue;
          }
          log("error", "grok.generate_failed", { attempt });
          yield { type: "error", error: userSafeProviderError(e, "grok") };
          return;
        }
      }
    },
    async generateStructured() {
      throw new AetherError("not_supported", "Structured generation is not enabled", 501);
    },
  };
}
