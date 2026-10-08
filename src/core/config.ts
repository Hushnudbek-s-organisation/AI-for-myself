import { AetherError } from "./errors";

export type AppEnv = "development" | "production" | "test";
export type LiveProviderId = "openai" | "gemini" | "grok";

export const LIVE_PROVIDER_IDS: LiveProviderId[] = ["openai", "gemini", "grok"];

/**
 * Optional per-provider wire-id overrides. These are *never* required and are never
 * shipped with a default value: they exist so an operator can pin a free-tier model id
 * copied from their own provider dashboard.
 */
export const MODEL_ENV_VAR: Record<LiveProviderId, string> = {
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
  grok: "GROK_MODEL",
};

export const PROVIDER_LABEL: Record<LiveProviderId, string> = {
  openai: "ChatGPT",
  gemini: "Gemini",
  grok: "Grok",
};

function envName(): AppEnv {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

function trimEnv(...names: string[]): string {
  for (const n of names) {
    const v = (process.env[n] || "").trim();
    if (v) return v;
  }
  return "";
}

const WEAK_SECRETS = new Set([
  "",
  "change-me-in-production-use-a-long-random-string",
  "dev-only-change-me-aether-secret-key",
]);

export interface AppConfig {
  env: AppEnv;
  mockMode: boolean;
  allowDemoAccounts: boolean;
  secret: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  gemini: {
    apiKey: string;
    baseUrl: string;
  };
  grok: {
    apiKey: string;
    baseUrl: string;
  };
  /** Optional free-tier wire-id overrides. Empty string = resolve from the provider's live model list. */
  models: Record<LiveProviderId, string>;
  timeoutMs: number;
  maxRetries: number;
  appUrl: string;
}

export function getConfig(): AppConfig {
  const env = envName();
  return {
    env,
    mockMode: bool("AI_MOCK_MODE", false),
    allowDemoAccounts: bool("ALLOW_DEMO_ACCOUNTS", false) && env !== "production",
    secret: process.env.AETHER_SECRET || "",
    openaiApiKey: trimEnv("OPENAI_API_KEY"),
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    gemini: {
      apiKey: trimEnv("GEMINI_API_KEY", "GOOGLE_API_KEY"),
      baseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
    },
    grok: {
      apiKey: trimEnv("XAI_API_KEY", "GROK_API_KEY"),
      baseUrl: (process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, ""),
    },
    // No hardcoded model ids: an empty override means "ask the provider which free models this key can call".
    models: {
      openai: trimEnv("OPENAI_MODEL", "AI_MODEL_DEFAULT"),
      gemini: trimEnv("GEMINI_MODEL", "GEMINI_MODEL_DEFAULT"),
      grok: trimEnv("GROK_MODEL", "XAI_MODEL", "GROK_MODEL_DEFAULT"),
    },
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 60_000),
    maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  };
}

export function providerApiKey(provider: LiveProviderId): string {
  const c = getConfig();
  if (provider === "gemini") return c.gemini.apiKey;
  if (provider === "grok") return c.grok.apiKey;
  return c.openaiApiKey;
}

export function providerBaseUrl(provider: LiveProviderId): string {
  const c = getConfig();
  if (provider === "gemini") return c.gemini.baseUrl;
  if (provider === "grok") return c.grok.baseUrl;
  return c.openaiBaseUrl;
}

export function isProduction(): boolean {
  return envName() === "production";
}

export function configuredLiveProviders(): LiveProviderId[] {
  const out: LiveProviderId[] = [];
  for (const p of LIVE_PROVIDER_IDS) {
    if (providerApiKey(p)) out.push(p);
  }
  return out;
}

export function defaultLiveProvider(): LiveProviderId | null {
  return configuredLiveProviders()[0] ?? null;
}

export function missingKeyMessage(provider: LiveProviderId): string {
  if (provider === "gemini") {
    return "GEMINI_API_KEY is not set. Add a Google AI Studio key, or pick a different provider.";
  }
  if (provider === "grok") {
    return "XAI_API_KEY is not set. Add an xAI key, or pick a different provider.";
  }
  return "OPENAI_API_KEY is not set. Add an OpenAI key, or pick a different provider.";
}

/** Runtime checks — do not call at import time (would break `next build`). */
export function assertRuntimeConfig(): void {
  const c = getConfig();
  if (c.env === "production") {
    if (WEAK_SECRETS.has(c.secret) || c.secret.length < 24) {
      throw new AetherError(
        "misconfigured",
        "AETHER_SECRET must be set to a strong value in production",
        500,
      );
    }
    if (c.mockMode) {
      throw new AetherError(
        "misconfigured",
        "AI_MOCK_MODE is not allowed in production",
        500,
      );
    }
    if (!configuredLiveProviders().length) {
      throw new AetherError(
        "misconfigured",
        "At least one of OPENAI_API_KEY, GEMINI_API_KEY, or XAI_API_KEY is required in production",
        500,
      );
    }
  }
}

export function requireRealProviderOrMock(): "mock" | LiveProviderId {
  const c = getConfig();
  if (c.mockMode) return "mock";
  const live = defaultLiveProvider();
  if (live) return live;
  throw new AetherError(
    "ai_unconfigured",
    "No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, and/or XAI_API_KEY in .env, or set AI_MOCK_MODE=true for local development only.",
    503,
  );
}

export interface AiStatus {
  provider: LiveProviderId | "mock" | "unconfigured";
  providers: { openai: boolean; gemini: boolean; grok: boolean };
  mock: boolean;
  configured: boolean;
  /** Env override only. The live wire id is resolved per request — see models/discovery. */
  model: string | null;
}

/** Synchronous, network-free view. Never claims a model id it has not verified. */
export function publicAiStatus(): AiStatus {
  const c = getConfig();
  const providers = {
    openai: Boolean(c.openaiApiKey),
    gemini: Boolean(c.gemini.apiKey),
    grok: Boolean(c.grok.apiKey),
  };
  if (c.mockMode) {
    return {
      provider: "mock",
      providers,
      mock: true,
      configured: true,
      model: "aether-engine-v1",
    };
  }
  const live = defaultLiveProvider();
  if (live) {
    return { provider: live, providers, mock: false, configured: true, model: c.models[live] || null };
  }
  return { provider: "unconfigured", providers, mock: false, configured: false, model: null };
}