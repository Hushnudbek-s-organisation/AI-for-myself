import { AetherError } from "./errors";

export type AppEnv = "development" | "production" | "test";

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
  return {
    env,
    mockMode,
    allowDemoAccounts: bool("ALLOW_DEMO_ACCOUNTS", false) && env !== "production",
    secret: process.env.AETHER_SECRET || "",
    openaiApiKey,
    openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
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
    if (!c.openaiApiKey) {
      throw new AetherError(
        "misconfigured",
        "OPENAI_API_KEY is required in production",
        500,
      );
    }
  }
}

export function requireRealProviderOrMock(): "mock" | "openai" {
  const c = getConfig();
  if (c.mockMode) return "mock";
  if (c.openaiApiKey) return "openai";
  throw new AetherError(
    "ai_unconfigured",
    "No AI provider configured. Set OPENAI_API_KEY, or set AI_MOCK_MODE=true for local development only.",
    503,
  );
}

export function publicAiStatus(): {
  provider: "openai" | "mock" | "unconfigured";
  mock: boolean;
  configured: boolean;
  model: string;
} {
  const c = getConfig();
  if (c.mockMode) {
    return { provider: "mock", mock: true, configured: true, model: "aether-engine-v1" };
  }
  if (c.openaiApiKey) {
    return { provider: "openai", mock: false, configured: true, model: c.models.default };
  }
  return { provider: "unconfigured", mock: false, configured: false, model: c.models.default };
}
