import type { ModelProvider, ModelTier } from "../types";
import { builtinProvider } from "./builtin";
import { createOpenAIProvider } from "./openai";
import { getConfig, requireRealProviderOrMock } from "../config";
import { AetherError } from "../errors";

export function listProviders(): Array<{
  id: string;
  name: string;
  available: boolean;
  mock?: boolean;
  tiers: ModelTier[];
}> {
  const cfg = getConfig();
  const openai = createOpenAIProvider();
  return [
    {
      id: builtinProvider.id,
      name: builtinProvider.name,
      available: cfg.mockMode,
      mock: true,
      tiers: builtinProvider.tiers,
    },
    {
      id: "openai",
      name: "OpenAI",
      available: Boolean(openai) && !cfg.mockMode,
      mock: false,
      tiers: ["fast", "balanced", "reasoning"],
    },
  ];
}

export function resolveProvider(model?: string | null): { provider: ModelProvider; model: string; mock: boolean } {
  const mode = requireRealProviderOrMock();
  const cfg = getConfig();
  if (mode === "mock") {
    return { provider: builtinProvider, model: "aether-engine-v1", mock: true };
  }
  const openai = createOpenAIProvider();
  if (!openai) {
    throw new AetherError("ai_unconfigured", "OPENAI_API_KEY is not set", 503);
  }
  const requested = model && model !== "aether-engine-v1" ? model : cfg.models.default;
  return { provider: openai, model: requested, mock: false };
}

export function defaultModel(): string {
  const cfg = getConfig();
  if (cfg.mockMode) return "aether-engine-v1";
  return cfg.models.default;
}

export function isAllowedModel(requested: string | undefined | null, projectAllowed: string[]): boolean {
  if (!requested) return true;
  if (!projectAllowed.length) return true;
  return projectAllowed.includes(requested);
}
