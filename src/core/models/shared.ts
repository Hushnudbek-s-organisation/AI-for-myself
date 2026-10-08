import { MODEL_ENV_VAR, PROVIDER_LABEL, getConfig, type LiveProviderId } from "../config";
import { AetherError, isPublicError } from "../errors";
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

export type FailureProviderId = LiveProviderId | "mock";

function failureProviderLabel(provider: FailureProviderId): string {
  return provider === "mock" ? "Aether's local mock provider" : PROVIDER_LABEL[provider];
}

/** A user-safe summary for provider failures; never includes provider response text or credentials. */
export function providerFailureMessage(
  provider: FailureProviderId,
  kind: "rejected" | "unavailable",
  status?: number,
): string {
  const statusText = status && Number.isFinite(status) ? ` (HTTP ${status})` : "";
  if (provider === "mock") {
    return kind === "rejected"
      ? `${failureProviderLabel(provider)} rejected the request${statusText}. Check the request and retry.`
      : `${failureProviderLabel(provider)} could not complete the request${statusText}. Check the server logs and retry.`;
  }

  const label = PROVIDER_LABEL[provider];
  const envVar = MODEL_ENV_VAR[provider];
  if (kind === "rejected") {
    const target = status === 401 || status === 403 ? "the configured credentials" : "the request";
    return (
      `${label} rejected ${target}${statusText}. Check that ${envVar} is a model id this account can actually call ` +
      `and that the key is valid. Aether will not switch model or fall back to mock.`
    );
  }
  return (
    `${label} could not be reached${statusText}. This is usually a provider outage, a network block, or an over-long prompt — ` +
    `retry shortly. If it keeps happening, check that the ${label} key and ${envVar} match your free-tier account. ` +
    `Aether never falls back to mock.`
  );
}

function providerTimeoutMessage(provider: FailureProviderId): string {
  return `${failureProviderLabel(provider)} timed out. Shorten the message, or raise AI_TIMEOUT_MS in .env.`;
}

const MODEL_DENIED = /model[_ -]?not[_ -]?found|unknown[_ -]?model|invalid[_ -]?model|model .*(does not exist|not found|is not)|unsupported[_ -]?model|no such model|not available on this/i;
const BILLING = /insufficient[_ -]?quota|billing|credit balance|prepaid|payment required|not entitled|no access to|does not have access|subscription|upgrade your plan|free tier limit/i;

function errorText(err: unknown): string {
  if (typeof err === "string") return err.toLowerCase();
  const e = (err ?? {}) as {
    message?: unknown;
    code?: unknown;
    type?: unknown;
    param?: unknown;
    status?: unknown;
    error?: unknown;
    response?: { status?: unknown; data?: unknown; body?: unknown; error?: unknown };
  };
  const parts: string[] = [];
  if (typeof e.message === "string") parts.push(e.message);
  if (typeof e.code === "string") parts.push(e.code);
  if (typeof e.type === "string") parts.push(e.type);
  if (typeof e.param === "string") parts.push(e.param);
  const nested = (e.error ?? e.response?.error ?? (e.response?.data ?? e.response?.body)) as
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
    response?: { status?: unknown; error?: { status?: unknown; code?: unknown } };
    error?: { status?: unknown; code?: unknown };
  };
  for (const v of [
    e.status,
    e.response?.status,
    e.response?.error?.status,
    e.response?.error?.code,
    e.error?.status,
    e.error?.code,
  ]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  const status = /\b([45]\d{2})\b/.exec(errorText(err));
  return status ? Number(status[1]) : undefined;
}

/**
 * User-safe provider error. Model / billing problems retain their dedicated
 * guidance; all other failures name the provider and the next operator action.
 */
export function userSafeProviderError(err: unknown, provider: LiveProviderId): string {
  const text = errorText(err);
  const status = errorStatus(err);
  if (status === 404 || (MODEL_DENIED.test(text) && (status === undefined || status < 500))) {
    return modelAccessMessage(provider);
  }
  if (status === 402 || (BILLING.test(text) && (status === undefined || status < 500))) {
    return modelAccessMessage(provider);
  }
  if (/timeout|timed out|deadline exceeded|aborted|abort|etimedout/.test(text)) {
    return providerTimeoutMessage(provider);
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return providerFailureMessage(provider, "rejected", status);
  }
  if (status !== undefined && status >= 500) {
    return providerFailureMessage(provider, "unavailable", status);
  }
  if (/rate limit|too many requests/.test(text)) {
    return providerFailureMessage(provider, "rejected", 429);
  }
  if (/api key|incorrect api key|invalid_api_key|unauthorized|permission denied/.test(text)) {
    return providerFailureMessage(provider, "rejected");
  }
  return providerFailureMessage(provider, "unavailable");
}

/** Same mapping for providers that answer with a raw HTTP status (Gemini, xAI). */
export function httpStatusError(status: number, body = "", provider: LiveProviderId): string {
  const text = body.toLowerCase();
  if (status === 404 || (MODEL_DENIED.test(text) && status < 500)) return modelAccessMessage(provider);
  if (status === 402 || (BILLING.test(text) && status < 500)) return modelAccessMessage(provider);
  if (/timeout|timed out|deadline exceeded|aborted|abort|etimedout/.test(text)) {
    return providerTimeoutMessage(provider);
  }
  if (status >= 400 && status < 500) return providerFailureMessage(provider, "rejected", status);
  return providerFailureMessage(provider, "unavailable", status);
}

/** Keep explicit platform errors intact; sanitize all unexpected provider exceptions. */
export function userSafeFailureMessage(err: unknown, provider: FailureProviderId): string {
  if (err instanceof AetherError && isPublicError(err.code)) return err.message;
  if (provider === "mock") {
    const text = errorText(err);
    if (/timeout|timed out|deadline exceeded|aborted|abort|etimedout/.test(text)) {
      return providerTimeoutMessage(provider);
    }
    const status = errorStatus(err);
    return providerFailureMessage(
      provider,
      status !== undefined && status >= 400 && status < 500 ? "rejected" : "unavailable",
      status,
    );
  }
  return userSafeProviderError(err, provider);
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