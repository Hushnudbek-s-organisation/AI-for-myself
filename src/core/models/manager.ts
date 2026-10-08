import type { ModelProvider, ModelTier } from "../types";
import { builtinProvider } from "./builtin";
import { createOpenAIProvider } from "./openai";
import { createGeminiProvider } from "./gemini";
import { createGrokProvider } from "./grok";
import {
  PICKER_FOR_PROVIDER,
  PROVIDER_FOR_PICKER,
  catalog,
  normalizeModelId,
  type CatalogId,
  type PickerId,
  type ProviderId,
} from "./catalog";
import { resolveWireModel, resolveWireModels, type WireOutcome } from "./discovery";
import {
  LIVE_PROVIDER_IDS,
  getConfig,
  missingKeyMessage,
  requireRealProviderOrMock,
  type LiveProviderId,
} from "../config";
import { AetherError } from "../errors";

export interface PublicModel {
  id: PickerId | "aether-engine-v1";
  label: string;
  provider: ProviderId;
  tier: ModelTier;
  available: boolean;
  mock?: boolean;
  aliases: string[];
  /** Resolved wire id (never the API key). Null until discovery has answered. */
  wireModel?: string | null;
  /** "env" | "discovery" | "unresolved" */
  wireSource?: "env" | "discovery" | "unresolved";
  /** Why this id, or what the operator should do about it. */
  note?: string;
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
      name: "ChatGPT",
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
      name: "Grok",
      available: Boolean(createGrokProvider()) && !cfg.mockMode,
      mock: false,
      tiers: ["fast", "balanced", "reasoning"],
    },
  ];
}

function providerAvailable(id: LiveProviderId): boolean {
  if (id === "openai") return Boolean(createOpenAIProvider());
  if (id === "gemini") return Boolean(createGeminiProvider());
  return Boolean(createGrokProvider());
}

export function listPublicModels(resolved?: Record<string, WireOutcome>): PublicModel[] {
  const cfg = getConfig();
  const live: PublicModel[] = catalog().map((m) => {
    const available = !cfg.mockMode && providerAvailable(m.provider);
    const outcome = resolved?.[m.provider];
    const entry: PublicModel = {
      id: m.id,
      label: m.label,
      provider: m.provider,
      tier: m.tier,
      available,
      aliases: m.aliases,
      wireModel: null,
      wireSource: "unresolved",
    };
    if (outcome?.ok) {
      entry.wireModel = outcome.resolution.wireModel;
      entry.wireSource = outcome.resolution.source;
      entry.note = outcome.resolution.reason;
    } else if (outcome?.problem) {
      entry.note = outcome.problem.message;
    }
    return entry;
  });
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
        wireModel: "aether-engine-v1",
        wireSource: "env",
        note: "AI_MOCK_MODE=true. Not a real provider — replies are generated locally.",
      },
      ...live.map((m) => ({ ...m, available: false })),
    ];
  }
  return live;
}

/** Picker ids for the configured providers, plus resolved wire ids for health/settings. */
export async function describeModels(waitMs = 1200): Promise<Record<string, WireOutcome>> {
  if (getConfig().mockMode) return {};
  return resolveWireModels(waitMs);
}

function instantiate(id: LiveProviderId): ModelProvider | null {
  if (id === "openai") return createOpenAIProvider();
  if (id === "gemini") return createGeminiProvider();
  return createGrokProvider();
}

export interface ResolvedProvider {
  provider: ModelProvider;
  /** Wire id sent to the provider — resolved from the key's live model list or an env override. */
  model: string;
  /** Picker id, stored on the conversation and shown in the UI. */
  catalogId: CatalogId;
  mock: boolean;
  source: "env" | "discovery";
}

/**
 * Browser → /v1 → gateway → provider. A key that exists but cannot name a usable
 * model yields a 503 — never a mock, never a guessed paid id.
 */
export async function resolveProvider(model?: string | null): Promise<ResolvedProvider> {
  const mode = requireRealProviderOrMock();
  if (mode === "mock") {
    return {
      provider: builtinProvider,
      model: "aether-engine-v1",
      catalogId: "aether-engine-v1",
      mock: true,
      source: "env",
    };
  }

  const requested = model && model !== "aether-engine-v1" ? model : defaultModel();
  const catalogId = (normalizeModelId(requested) ?? "chatgpt") as PickerId;
  const providerId = PROVIDER_FOR_PICKER[catalogId];
  const live = instantiate(providerId);
  if (!live) {
    throw new AetherError("ai_unconfigured", missingKeyMessage(providerId), 503);
  }

  const resolution = await resolveWireModel(providerId);
  return { provider: live, model: resolution.wireModel, catalogId, mock: false, source: resolution.source };
}

export function defaultModel(): PickerId | "aether-engine-v1" {
  const cfg = getConfig();
  if (cfg.mockMode) return "aether-engine-v1";
  const live = LIVE_PROVIDER_IDS.find((p) => providerAvailable(p));
  if (!live) return "chatgpt";
  return PICKER_FOR_PROVIDER[live];
}

export function isAllowedModel(requested: string | undefined | null, projectAllowed: string[]): boolean {
  if (!requested) return true;
  if (!projectAllowed.length) return true;
  const id: PickerId = normalizeModelId(requested) ?? "chatgpt";
  // An env-pinned wire id is allowed to match too, so projects can pin exact free-tier ids.
  const override = getConfig().models[PROVIDER_FOR_PICKER[id]];
  return (
    projectAllowed.includes(requested) ||
    projectAllowed.includes(id) ||
    (Boolean(override) && projectAllowed.includes(override))
  );
}