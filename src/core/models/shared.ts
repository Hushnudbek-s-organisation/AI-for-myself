import { MODEL_ENV_VAR, PROVIDER_LABEL, getConfig, type LiveProviderId } from "../config";
import { AetherError } from "../errors";
import { log } from "../log";

/**
 * Shown when a key exists but cannot call the model it was given. Never swap to
 * another model and never fall back to mock — the operator fixes the env var.
 */
export function modelAccessMessage(provider: LiveProviderId): string {
  return (
    `This API key cannot use that model. Open the ${PROVIDER_LABEL[provider]} dashboard, copy a model id this ` +
    `account can actually call (free tier is fine), and set ${MODEL_ENV_VAR[provider]} in .env. ` +
    `Aether will not guess a paid model id and will not fall back to mock.`
  );
}

const MODEL_DENIED = /model[_ -]?not[_ -]?found|unknown[_ -]?model|invalid[_ -]?model|model .*(does not exist|not found|is not)|unsupported[_ -]?model|no such model|not available on this/i;
const BILLING = /insufficient[_ -]?quota|billing|credit balance|prepaid|payment required|not entitled|no access to|does not have access|subscription|upgrade your plan|free tier limit/i;

function errorText(err: unknown): string {
  const e = (err ?? {}) as {
    message?: unknown;
    code?: unknown;
    type?: unknown;
    param?: unknown;
    status?: unknown;
    error?: unknown;
    response?: { status?: unknown; data?: unknown; body?: unknown };
  };
  const parts: string[] = [];
  if (typeof e.message === "string") parts.push(e.message);
  if (typeof e.code === "string") parts.push(e.code);
  if (typeof e.type === "string") parts.push(e.type);
  if (typeof e.param === "string") parts.push(e.param);
  const nested = (e.error ?? (e.response?.data ?? e.response?.body)) as
    | { code?: unknown; type?: unknown; message?: unknown }
    | string
    | undefined;
  if (typeof nested === "string") parts.push(nested);
  else if (nested && typeof nested === "object") {
    if (typeof nested.code === "string") parts.push(nested.code);
    if (typeof nested.type === "string") parts.push(nested.type);
    if (typeof nested.message === "string") parts.push(nested.message);
  }
  return parts.join(" ").toLowerCase();
}

function errorStatus(err: unknown): number | undefined {
  const e = (err ?? {}) as {
    status?: unknown;
    response?: { status?: unknown };
    error?: { status?: unknown };
  };
  for (const v of [e.status, e.response?.status, e.error?.status]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  const m = errorText(err);
  const m404 = /\b404\b/.exec(m);
  if (m404) return 404;
  const m401 = /\b401\b/.exec(m);
  if (m401) return 401;
  const m429 = /\b429\b/.exec(m);
  if (m429) return 429;
  return undefined;
}

/**
 * User-safe provider error. Model / billing problems are reported as such so the
 * operator knows exactly which env var to set.
 */
export function userSafeProviderError(err: unknown, provider: LiveProviderId): string {
  const text = errorText(err);
  const status = errorStatus(err);
  if (status === 404 || MODEL_DENIED.test(text)) return modelAccessMessage(provider);
  if (status === 402 || BILLING.test(text)) return modelAccessMessage(provider);
  if (status === 429 || /rate limit|too many requests/.test(text)) {
    return "The AI service is rate limiting requests. Try again shortly.";
  }
  if (status === 401 || status === 403 || /api key|incorrect api key|invalid_api_key|unauthorized|permission denied/.test(text)) {
    return "The AI service rejected the configured credentials.";
  }
  if (/timeout|aborted|abort|etimedout/.test(text)) {
    return "The AI service timed out.";
  }
  return "The AI service is temporarily unavailable. Please try again.";
}

/** Same mapping for providers that answer with a raw HTTP status (Gemini, xAI). */
export function httpStatusError(status: number, body = "", provider: LiveProviderId): string {
  const text = body.toLowerCase();
  if (status === 404 || MODEL_DENIED.test(text)) return modelAccessMessage(provider);
  if (status === 402 || BILLING.test(text)) return modelAccessMessage(provider);
  if (status === 429) return "The AI service is rate limiting requests. Try again shortly.";
  if (status === 401 || status === 403) return "The AI service rejected the configured credentials.";
  if (status >= 500) return "The AI service is temporarily unavailable. Please try again.";
  return "The AI service is temporarily unavailable. Please try again.";
}

/** Read a provider error body without ever letting it break the stream. */
export async function safeErrorText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 2000);
  } catch {
    return "";
  }
}

/** A wire id must come from the router — providers never invent a default. */
export function requireWireModel(model: string | undefined, provider: LiveProviderId): string {
  const id = (model || "").trim();
  if (id && id !== "aether-engine-v1") return id;
  throw new AetherError("model_unavailable", modelAccessMessage(provider), 503);
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

export function isTransientProviderError(msg: string): boolean {
  return /429|500|502|503|504|ECONNRESET|ETIMEDOUT|network/i.test(msg);
}

/** Retry only what is worth retrying: never retry a denied model or a billing wall. */
export function isRetryableProviderError(err: unknown): boolean {
  const text = errorText(err);
  const status = errorStatus(err);
  if (status === 404 || status === 402) return false;
  if (MODEL_DENIED.test(text) || BILLING.test(text)) return false;
  if (status && status >= 400 && status < 500) return false;
  return isTransientProviderError(text);
}

export async function backoff(attempt: number): Promise<void> {
  const delay = Math.min(2000, 250 * 2 ** (attempt - 1));
  log("warn", "provider.retry", { attempt, delay });
  await sleep(delay);
}