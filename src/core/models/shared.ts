import { getConfig } from "../config";
import { log } from "../log";

export function userSafeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "provider error";
  if (/api key|incorrect api key|invalid_api_key|401|403/i.test(raw)) {
    return "The AI service rejected the configured credentials.";
  }
  if (/rate limit|429/i.test(raw)) {
    return "The AI service is rate limiting requests. Try again shortly.";
  }
  if (/timeout|aborted|abort/i.test(raw)) {
    return "The AI service timed out.";
  }
  if (/model/i.test(raw) && /not found|does not exist|invalid/i.test(raw)) {
    return "The selected model is not available on this provider account. Check AI_MODEL_* / GEMINI_MODEL / GROK_MODEL.";
  }
  return "The AI service is temporarily unavailable. Please try again.";
}

export function mergeAbort(timeoutMs?: number, abort?: AbortSignal): AbortSignal {
  const timeout = timeoutMs ?? getConfig().timeoutMs;
  const t = AbortSignal.timeout(timeout);
  if (!abort) return t;
  return AbortSignal.any([abort, t]);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export function parseSseDataLine(line: string): unknown | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return undefined;
  let payload = trimmed;
  if (trimmed.startsWith("data:")) payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

export async function* iterateSseJson(res: Response): AsyncGenerator<unknown> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const obj = parseSseDataLine(line);
      if (obj !== undefined) yield obj;
      nl = buf.indexOf("\n");
    }
  }
  const last = parseSseDataLine(buf);
  if (last !== undefined) yield last;
}

export function httpStatusError(status: number): string {
  if (status === 401 || status === 403) return "The AI service rejected the configured credentials.";
  if (status === 429) return "The AI service is rate limiting requests. Try again shortly.";
  if (status === 404) {
    return "The selected model is not available on this provider account. Check AI_MODEL_* / GEMINI_MODEL / GROK_MODEL.";
  }
  return "The AI service is temporarily unavailable. Please try again.";
}

export function isTransientProviderError(msg: string): boolean {
  return /429|500|502|503|504|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

export async function backoff(attempt: number): Promise<void> {
  const delay = Math.min(2000, 250 * 2 ** (attempt - 1));
  log("warn", "provider.retry", { attempt, delay });
  await sleep(delay);
}
