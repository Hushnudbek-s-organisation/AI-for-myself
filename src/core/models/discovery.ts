import { createHash } from "node:crypto";
import {
  MODEL_ENV_VAR,
  PROVIDER_LABEL,
  getConfig,
  providerApiKey,
  providerBaseUrl,
  type LiveProviderId,
} from "../config";
import { AetherError } from "../errors";
import { log } from "../log";

/** Model discovery is best-effort: short timeout, never blocks a request for long. */
export const DISCOVERY_TIMEOUT_MS = Number(process.env.AI_DISCOVERY_TIMEOUT_MS || 4000);
const OK_TTL_MS = 15 * 60_000;
const PROBLEM_TTL_MS = 60_000;
const MAX_REPORTED_MODELS = 40;

export type ModelProblemKind =
  | "no_key"
  | "credentials_rejected"
  | "list_failed"
  | "list_empty"
  | "no_usable_model";

export interface ModelProblem {
  kind: ModelProblemKind;
  provider: LiveProviderId;
  message: string;
  status?: number;
}

export interface WireResolution {
  provider: LiveProviderId;
  /** The id actually sent to the provider. */
  wireModel: string;
  /** "env" = operator pinned it, "discovery" = picked from this key's live model list. */
  source: "env" | "discovery";
  /** Ids the provider returned (capped) — for the developer/health views. */
  discovered: string[];
  envVar: string;
  reason: string;
}

export type WireOutcome = { ok: true; resolution: WireResolution } | { ok: false; problem: ModelProblem };

function label(p: LiveProviderId): string {
  return PROVIDER_LABEL[p];
}

/** Keys are hashed before they touch the cache — plaintext keys are never stored. */
function keyFingerprint(provider: LiveProviderId): string {
  const key = providerApiKey(provider);
  if (!key) return "no-key";
  return createHash("sha256").update(`${provider}:${key}`).digest("hex").slice(0, 16);
}

export function modelUnavailableMessage(provider: LiveProviderId, kind: ModelProblemKind): string {
  const envVar = MODEL_ENV_VAR[provider];
  if (kind === "credentials_rejected") {
    return `${label(provider)} rejected the configured API key. Check the key for ${label(provider)} in .env.`;
  }
  if (kind === "no_key") {
    return `No API key configured for ${label(provider)}.`;
  }
  if (kind === "list_failed") {
    return (
      `${label(provider)} accepted the key but the model list could not be read (network error or timeout). ` +
      `Open the ${label(provider)} dashboard, copy a free-tier model id, and set ${envVar} in .env.`
    );
  }
  return (
    `${label(provider)} key is set, but no usable free model came back from the model list. ` +
    `Open the ${label(provider)} dashboard, copy a model id this free account can actually call, ` +
    `and set ${envVar} in .env. Aether will not guess a paid model id.`
  );
}

function normalizeId(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/^models\//, "").trim() : "";
}

/** Pull ids out of either an OpenAI-compatible list or a Gemini list. */
export function parseModelList(provider: LiveProviderId, payload: unknown): string[] {
  const body = payload as { data?: unknown; models?: unknown } | null;
  if (!body || typeof body !== "object") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  if (provider === "gemini") {
    if (Array.isArray(body.models)) {
      for (const m of body.models) {
        const entry = m as { name?: string; supportedGenerationMethods?: string[] };
        const methods = entry.supportedGenerationMethods;
        // Respect what the provider says it can generate with — never assume.
        if (Array.isArray(methods) && methods.length && !methods.includes("generateContent")) continue;
        add(normalizeId(entry.name));
      }
    }
    return out;
  }
  if (Array.isArray(body.data)) {
    for (const m of body.data) {
      add(normalizeId((m as { id?: string })?.id));
    }
  }
  return out;
}

/** Not chat/generate models — never a candidate for the chat wire. */
const NON_CHAT_TOKENS = [
  "embedding",
  "embed",
  "tts",
  "whisper",
  "transcrib",
  "translat",
  "moderation",
  "dall",
  "image",
  "imagen",
  "veo",
  "gemma",
  "bison",
  "aqa",
  "learnlm",
  "batch",
  "realtime",
  "audio",
  "vision",
  "rerank",
  "computer-use",
  "deep-research",
  "omni",
  "safety",
  "similarity",
  "classify",
  "caching",
];

/** Higher = cheaper / faster. Only ever applied to ids the provider actually returned. */
const FREE_WEIGHTS: Record<string, number> = {
  free: 100,
  flash: 40,
  lite: 35,
  nano: 35,
  tiny: 30,
  mini: 30,
  haiku: 30,
  small: 20,
  instant: 20,
  basic: 15,
  turbo: 10,
};

/** Signals that a model is usually paid-only. Used to break ties, never to filter. */
const PAID_WEIGHTS: Record<string, number> = {
  pro: 12,
  max: 15,
  ultra: 15,
  opus: 15,
  large: 10,
  premium: 12,
  enterprise: 10,
  business: 8,
  reasoning: 10,
  thinking: 10,
  preview: 5,
  plus: 8,
};

export function scoreModelId(id: string): number {
  const tokens = id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    if (FREE_WEIGHTS[t] !== undefined) score += FREE_WEIGHTS[t];
    if (PAID_WEIGHTS[t] !== undefined) score -= PAID_WEIGHTS[t];
  }
  return score;
}

export function isChatCandidate(id: string): boolean {
  const tokens = id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return !tokens.some((t) => NON_CHAT_TOKENS.some((bad) => t.startsWith(bad) || t.includes(bad)));
}

/**
 * Free-tier selection rule, applied only to ids the provider's own model list returned:
 * 1. drop ids that are not chat/generate models,
 * 2. score cheap/fast markers (free > flash/lite/nano > mini > small > basic/turbo),
 * 3. penalise paid-tier markers (pro/max/ultra/opus/reasoning/preview),
 * 4. break ties on the shorter id, then alphabetically (deterministic).
 */
export function pickFreeModel(ids: string[]): string | null {
  const candidates = ids.filter((id) => id && isChatCandidate(id));
  if (!candidates.length) return null;
  const ranked = candidates.slice().sort((a, b) => {
    const diff = scoreModelId(b) - scoreModelId(a);
    if (diff !== 0) return diff;
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return ranked[0] ?? null;
}

function listUrl(provider: LiveProviderId): string {
  const base = providerBaseUrl(provider);
  return provider === "gemini" ? `${base}/models?pageSize=200` : `${base}/models`;
}

function listHeaders(provider: LiveProviderId): Record<string, string> {
  const key = providerApiKey(provider);
  return provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
}

export interface ProviderListResult {
  ids: string[];
  problem?: ModelProblem;
}

/**
 * GET the provider's own model list. Fails soft: never throws, never guesses.
 * OpenAI + xAI: GET {BASE_URL}/models · Gemini: GET {GEMINI_BASE_URL}/models with x-goog-api-key
 */
export async function listProviderModels(provider: LiveProviderId): Promise<ProviderListResult> {
  if (!providerApiKey(provider)) {
    return {
      ids: [],
      problem: { kind: "no_key", provider, message: modelUnavailableMessage(provider, "no_key"), status: 503 },
    };
  }
  try {
    const res = await fetch(listUrl(provider), {
      method: "GET",
      headers: listHeaders(provider),
      cache: "no-store",
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) {
      const kind: ModelProblemKind = res.status === 401 || res.status === 403 ? "credentials_rejected" : "list_failed";
      return {
        ids: [],
        problem: { kind, provider, message: modelUnavailableMessage(provider, kind), status: res.status },
      };
    }
    const ids = parseModelList(provider, await res.json());
    return { ids };
  } catch (e) {
    log("warn", "models.list_failed", { provider, reason: e instanceof Error ? e.name : "unknown" });
    return {
      ids: [],
      problem: {
        kind: "list_failed",
        provider,
        message: modelUnavailableMessage(provider, "list_failed"),
        status: 503,
      },
    };
  }
}

type CacheEntry = { at: number; outcome: WireOutcome };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WireOutcome>>();

function cacheKey(provider: LiveProviderId): string {
  return `${provider}:${keyFingerprint(provider)}:${providerBaseUrl(provider)}`;
}

export function clearModelCache(): void {
  cache.clear();
  inflight.clear();
}

function envResolution(provider: LiveProviderId, id: string): WireResolution {
  return {
    provider,
    wireModel: id,
    source: "env",
    discovered: [],
    envVar: MODEL_ENV_VAR[provider],
    reason: `${MODEL_ENV_VAR[provider]} is set in .env, so that exact id is sent to ${label(provider)}.`,
  };
}

async function discover(provider: LiveProviderId): Promise<WireOutcome> {
  const override = getConfig().models[provider];
  if (override) return { ok: true, resolution: envResolution(provider, override) };

  const listed = await listProviderModels(provider);
  if (listed.problem) return { ok: false, problem: listed.problem };

  if (!listed.ids.length) {
    return {
      ok: false,
      problem: {
        kind: "list_empty",
        provider,
        message: modelUnavailableMessage(provider, "list_empty"),
        status: 503,
      },
    };
  }

  const picked = pickFreeModel(listed.ids);
  if (!picked) {
    return {
      ok: false,
      problem: {
        kind: "no_usable_model",
        provider,
        message: modelUnavailableMessage(provider, "no_usable_model"),
        status: 503,
      },
    };
  }

  return {
    ok: true,
    resolution: {
      provider,
      wireModel: picked,
      source: "discovery",
      discovered: listed.ids.slice(0, MAX_REPORTED_MODELS),
      envVar: MODEL_ENV_VAR[provider],
      reason: `Picked from the ${listed.ids.length} model id(s) this ${label(provider)} key can list — cheapest/fastest first. Set ${MODEL_ENV_VAR[provider]} to override.`,
    },
  };
}

/** Never throws. Returns the resolution or a user-safe problem. */
export async function resolveWireModelSafe(provider: LiveProviderId): Promise<WireOutcome> {
  const override = getConfig().models[provider];
  if (override) {
    // Env override wins outright — no discovery, no network call.
    const outcome: WireOutcome = { ok: true, resolution: envResolution(provider, override) };
    cache.set(cacheKey(provider), { at: Date.now(), outcome });
    return outcome;
  }

  const key = cacheKey(provider);
  const hit = cache.get(key);
  if (hit) {
    const ttl = hit.outcome.ok ? OK_TTL_MS : PROBLEM_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.outcome;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const run = discover(provider)
    .then((outcome) => {
      cache.set(key, { at: Date.now(), outcome });
      return outcome;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, run);
  return run;
}

/** Never silently mocks and never guesses a paid id: 503 with an actionable message. */
export async function resolveWireModel(provider: LiveProviderId): Promise<WireResolution> {
  const outcome = await resolveWireModelSafe(provider);
  if (outcome.ok) return outcome.resolution;
  throw new AetherError("model_unavailable", outcome.problem.message, outcome.problem.status ?? 503);
}

/**
 * Best-effort status for /api/health and /api/v1/models: waits up to `waitMs` for
 * discovery, then reports whatever is ready. Never blocks the UI on a slow provider.
 */
export async function resolveWireModels(waitMs: number): Promise<Record<string, WireOutcome>> {
  const out: Record<string, WireOutcome> = {};
  const pending: Array<Promise<void>> = [];
  for (const provider of ["openai", "gemini", "grok"] as LiveProviderId[]) {
    const cached = cache.get(cacheKey(provider));
    if (cached) {
      out[provider] = cached.outcome;
      continue;
    }
    pending.push(
      resolveWireModelSafe(provider).then((outcome) => {
        out[provider] = outcome;
      }),
    );
  }
  if (pending.length) {
    await Promise.race([
      Promise.all(pending),
      new Promise((r) => setTimeout(r, Math.max(0, waitMs))),
    ]);
  }
  return out;
}
/** Health/settings view of one provider: the resolved wire id, never the API key. */
export interface PublicModelStatus {
  wireModel: string | null;
  source: "env" | "discovery" | "unresolved";
  problem?: ModelProblemKind;
  note: string;
}

export function summarizeOutcome(outcome?: WireOutcome): PublicModelStatus {
  if (!outcome) {
    return {
      wireModel: null,
      source: "unresolved",
      note: "No usable model resolved yet. Aether will not guess a paid model id.",
    };
  }
  if (outcome.ok) {
    return { wireModel: outcome.resolution.wireModel, source: outcome.resolution.source, note: outcome.resolution.reason };
  }
  return { wireModel: null, source: "unresolved", problem: outcome.problem.kind, note: outcome.problem.message };
}
