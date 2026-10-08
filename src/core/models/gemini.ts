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

export function geminiContents(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${m.content}`;
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  if (contents[0]?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(prior context)" }] });
  }
  return contents;
}

export function geminiDeltaText(event: unknown): string {
  const obj = event as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = obj.candidates?.[0]?.content?.parts;
  if (!parts?.length) return "";
  return parts.map((p) => p.text || "").join("");
}

export function geminiUsage(event: unknown): { inputTokens: number; outputTokens: number } | null {
  const u = (event as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
    .usageMetadata;
  if (!u || typeof u.promptTokenCount !== "number") return null;
  return { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount ?? 0 };
}

export function createGeminiProvider(): ModelProvider | null {
  const cfg = getConfig();
  if (!cfg.gemini.apiKey) return null;
  const base = cfg.gemini.baseUrl;
  const apiKey = cfg.gemini.apiKey;

  return {
    id: "gemini",
    name: "Gemini",
    tiers: ["fast", "balanced", "reasoning"],
    supportsVision: () => true,
    supportsTools: () => false,
    supportsAudio: () => false,
    async healthCheck() {
      return { ok: true, configured: true, mock: false };
    },
    async *generate(params: GenerateParams): AsyncIterable<GenerateChunk> {
      const started = Date.now();
      // The router already resolved a free-tier id this key can call. Never guess here.
      const model = requireWireModel(params.model, "gemini");
      const signal = mergeAbort(params.timeoutMs, params.abort);
      const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      const body = {
        system_instruction: { parts: [{ text: params.assembled.systemText }] },
        contents: geminiContents(params.assembled.messages),
        generationConfig: { temperature: params.tier === "reasoning" ? 0.4 : 0.7 },
      };

      let attempt = 0;
      const max = Math.max(0, cfg.maxRetries);
      while (true) {
        attempt += 1;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(body),
            signal,
          });
          if (!res.ok) {
            const body = await safeErrorText(res);
            const msg = httpStatusError(res.status, body, "gemini");
            const transient = !/cannot use that model|rejected the configured credentials/.test(msg) && (res.status >= 500 || res.status === 429);
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
            if (
              event &&
              typeof event === "object" &&
              ("error" in event || ("type" in event && (event as { type?: unknown }).type === "error"))
            ) {
              yield { type: "error", error: userSafeProviderError(event, "gemini") };
              return;
            }
            const delta = geminiDeltaText(event);
            if (delta) yield { type: "token", text: redactSecrets(delta) };
            const u = geminiUsage(event);
            if (u) usageFromProvider = u;
          }

          yield {
            type: "usage",
            usage: {
              inputTokens: usageFromProvider?.inputTokens ?? 0,
              outputTokens: usageFromProvider?.outputTokens ?? 0,
              latencyMs: Date.now() - started,
              model,
              provider: "gemini",
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
          log("error", "gemini.generate_failed", { attempt });
          yield { type: "error", error: userSafeProviderError(e, "gemini") };
          return;
        }
      }
    },
    async generateStructured() {
      throw new AetherError("not_supported", "Structured generation is not enabled", 501);
    },
  };
}
