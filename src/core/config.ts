import { AetherError } from "./errors";

export type AppEnv = "development" | "production" | "test";
export type LiveProviderId = "openai" | "gemini" | "grok";

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
  openai: {
    lunaModel: string;
  };
  gemini: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    flashModel: string;
    proModel: string;
  };
  grok: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
  };
  models: {
    default: string;
    fast: string;
    reasoning: string;
  };
  timeoutMs: number;
  maxRetries: number;
  appUrl: string;
}

export function getConfig(): AppConfig {
  const env = envName();
  const mockMode = bool("AI_MOCK_MODE", false);
  const openaiApiKey = process.env.OPENAI_API_KEY || "";
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";
  const geminiDefault = process.env.GEMINI_MODEL || process.env.GEMINI_MODEL_DEFAULT || "gemini-2.5-flash";
  const grokDefault = process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-4.7";
  return {
    env,
    mockMode,
    allowDemoAccounts: bool("ALLOW_DEMO_ACCOUNTS", false) && env !== "production",
    secret: process.env.AETHER_SECRET || "",
    openaiApiKey,
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    openai: {
      lunaModel: process.env.OPENAI_MODEL_LUNA || process.env.CHATGPT_6_LUNA_MODEL || "gpt-6-luna",
    },
    gemini: {
      apiKey: geminiKey,
      baseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
      defaultModel: geminiDefault,
      flashModel: process.env.GEMINI_MODEL_FLASH || geminiDefault,
      proModel: process.env.GEMINI_MODEL_PRO || "gemini-2.5-pro",
    },
    grok: {
      apiKey: grokKey,
      baseUrl: (process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, ""),
      defaultModel: grokDefault,
    },
    models: {
      default:
        process.env.AI_MODEL_DEFAULT ||
        process.env.OPENAI_MODEL ||
        "gpt-5.5",
      fast: process.env.AI_MODEL_FAST || process.env.AI_MODEL_DEFAULT || process.env.OPENAI_MODEL || "gpt-5.5",
      reasoning:
        process.env.AI_MODEL_REASONING ||
        process.env.AI_MODEL_DEFAULT ||
        process.env.OPENAI_MODEL ||
        "gpt-5.5",
    },
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 60_000),
    maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
  };
}

export function isProduction(): boolean {
  return envName() === "production";
}

export function configuredLiveProviders(): LiveProviderId[] {
  const c = getConfig();
  const out: LiveProviderId[] = [];
  if (c.openaiApiKey) out.push("openai");
  if (c.gemini.apiKey) out.push("gemini");
  if (c.grok.apiKey) out.push("grok");
  return out;
}

export function defaultLiveProvider(): LiveProviderId | null {
  const live = configuredLiveProviders();
  return live[0] ?? null;
}

export function missingKeyMessage(provider: LiveProviderId): string {
  if (provider === "gemini") {
    return "GEMINI_API_KEY is not set. Add a Google AI Studio key, or pick a model from a configured provider.";
  }
  if (provider === "grok") {
    return "XAI_API_KEY is not set. Add an xAI key, or pick a model from a configured provider.";
  }
  return "OPENAI_API_KEY is not set. Add an OpenAI key, or pick a model from a configured provider.";
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
    "No AI provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, and/or XAI_API_KEY, or set AI_MOCK_MODE=true for local development only.",
    503,
  );
}

export function publicAiStatus(): {
  provider: LiveProviderId | "mock" | "unconfigured";
  providers: { openai: boolean; gemini: boolean; grok: boolean };
  mock: boolean;
  configured: boolean;
  model: string;
} {
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
    const model =
      live === "openai" ? c.models.default : live === "gemini" ? c.gemini.defaultModel : c.grok.defaultModel;
    return { provider: live, providers, mock: false, configured: true, model };
  }
  return { provider: "unconfigured", providers, mock: false, configured: false, model: c.models.default };
}
