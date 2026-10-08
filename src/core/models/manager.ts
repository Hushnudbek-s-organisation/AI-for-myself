import type { ModelProvider, ModelTier } from "../types";
import { builtinProvider } from "./builtin";
import { createOpenAIProvider } from "./openai";
import { createGeminiProvider } from "./gemini";
import { createGrokProvider } from "./grok";
import { catalog, inferProvider, normalizeModelId, wireModelId, type ProviderId } from "./catalog";
import {
  getConfig,
  missingKeyMessage,
  requireRealProviderOrMock,
  type LiveProviderId,
} from "../config";
import { AetherError } from "../errors";

export interface PublicModel {
  id: string;
  label: string;
  provider: ProviderId;
  tier: ModelTier;
  available: boolean;
  mock?: boolean;
  aliases: string[];
}

export function listProviders(): Array<{
  id: string;
  name: string;
  available: boolean;
  mock?: boolean;
  tiers: ModelTier[];
}> {
  const cfg = getConfig();
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
      name: "OpenAI (ChatGPT)",
      available: Boolean(createOpenAIProvider()) && !cfg.mockMode,
      mock: false,
      tiers: ["fast", "balanced", "reasoning"],
    },
    {
      id: "gemini",
      name: "Gemini",
      available: Boolean(createGeminiProvider()) && !cfg.mockMode,
      mock: false,
      tiers: ["fast", "balanced", "reasoning"],
    },
    {
      id: "grok",
      name: "Grok (xAI)",
      available: Boolean(createGrokProvider()) && !cfg.mockMode,
      mock: false,
      tiers: ["fast", "balanced", "reasoning"],
    },
  ];
}

export function listPublicModels(): PublicModel[] {
  const cfg = getConfig();
  const live: PublicModel[] = catalog().map((m) => ({
    id: m.id,
    label: m.label,
    provider: m.provider,
    tier: m.tier,
    available: !cfg.mockMode && providerAvailable(m.provider),
    aliases: m.aliases,
  }));
  if (cfg.mockMode) {
    return [
      {
        id: "aether-engine-v1",
        label: "Aether Engine (development fallback)",
        provider: "mock",
        tier: "fast",
        available: true,
        mock: true,
        aliases: [],
      },
      ...live.map((m) => ({ ...m, available: false })),
    ];
  }
  return live;
}

function providerAvailable(id: LiveProviderId): boolean {
  if (id === "openai") return Boolean(createOpenAIProvider());
  if (id === "gemini") return Boolean(createGeminiProvider());
  return Boolean(createGrokProvider());
}

function instantiate(id: LiveProviderId): ModelProvider | null {
  if (id === "openai") return createOpenAIProvider();
  if (id === "gemini") return createGeminiProvider();
  return createGrokProvider();
}

export function resolveProvider(model?: string | null): {
  provider: ModelProvider;
  model: string;
  catalogId: string;
  mock: boolean;
} {
  const mode = requireRealProviderOrMock();
  const cfg = getConfig();
  if (mode === "mock") {
    return { provider: builtinProvider, model: "aether-engine-v1", catalogId: "aether-engine-v1", mock: true };
  }
  const requested = model && model !== "aether-engine-v1" ? model : defaultModel();
  const catalogId = normalizeModelId(requested) || requested;
  const providerId = inferProvider(catalogId);
  const live = instantiate(providerId);
  if (!live) {
    throw new AetherError("ai_unconfigured", missingKeyMessage(providerId), 503);
  }
  const wire = wireModelId(catalogId);
  const resolved = wire && wire !== "aether-engine-v1" ? wire : defaultModelFor(providerId, cfg);
  return { provider: live, model: resolved, catalogId, mock: false };
}

function defaultModelFor(id: LiveProviderId, cfg: ReturnType<typeof getConfig>): string {
  if (id === "gemini") return cfg.gemini.defaultModel;
  if (id === "grok") return cfg.grok.defaultModel;
  return cfg.models.default;
}

export function defaultModel(): string {
  const cfg = getConfig();
  if (cfg.mockMode) return "aether-engine-v1";
  if (cfg.openaiApiKey) return cfg.models.default;
  if (cfg.gemini.apiKey) return cfg.gemini.defaultModel;
  if (cfg.grok.apiKey) return cfg.grok.defaultModel;
  return cfg.models.default;
}

export function isAllowedModel(requested: string | undefined | null, projectAllowed: string[]): boolean {
  if (!requested) return true;
  if (!projectAllowed.length) return true;
  const id = normalizeModelId(requested) || requested;
  const wire = wireModelId(id);
  return projectAllowed.includes(requested) || projectAllowed.includes(id) || projectAllowed.includes(wire);
}
