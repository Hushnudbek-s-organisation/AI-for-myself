import type { ModelTier } from "../types";
import { getConfig } from "../config";

export type ProviderId = "openai" | "gemini" | "grok" | "mock";

export interface CatalogModel {
  id: string;
  label: string;
  provider: Exclude<ProviderId, "mock">;
  tier: ModelTier;
  aliases: string[];
}

function pushUnique(list: CatalogModel[], item: CatalogModel) {
  if (!item.id) return;
  if (list.some((m) => m.id === item.id)) return;
  list.push(item);
}

function idBelongsTo(id: string, provider: CatalogModel["provider"]): boolean {
  const n = id.toLowerCase();
  if (n.startsWith("gemini") || n.startsWith("gemma")) return provider === "gemini";
  if (n.startsWith("grok") || n.startsWith("xai")) return provider === "grok";
  return provider === "openai";
}

/**
 * Supported catalog IDs. Wire IDs can be remapped with env vars.
 * Do not treat this list as proof that an account has the model.
 */
export function catalog(): CatalogModel[] {
  const c = getConfig();
  const items: CatalogModel[] = [];
  pushUnique(items, {
    id: "gpt-6-luna",
    label: "ChatGPT 6 Luna",
    provider: "openai",
    tier: "reasoning",
    aliases: ["chatgpt-6-luna", "chatgpt 6 luna", "luna", "chatgpt-6"],
  });
  pushUnique(items, {
    id: "gpt-6-astra",
    label: "ChatGPT 6 Astra",
    provider: "openai",
    tier: "balanced",
    aliases: ["gpt-6", "chatgpt-6-astra"],
  });
  if (idBelongsTo(c.models.default, "openai")) {
    pushUnique(items, {
      id: c.models.default,
      label: `OpenAI (${c.models.default})`,
      provider: "openai",
      tier: "balanced",
      aliases: ["openai", "chatgpt"],
    });
  }
  if (idBelongsTo(c.models.fast, "openai")) {
    pushUnique(items, {
      id: c.models.fast,
      label: `OpenAI fast (${c.models.fast})`,
      provider: "openai",
      tier: "fast",
      aliases: [],
    });
  }
  if (idBelongsTo(c.models.reasoning, "openai")) {
    pushUnique(items, {
      id: c.models.reasoning,
      label: `OpenAI reasoning (${c.models.reasoning})`,
      provider: "openai",
      tier: "reasoning",
      aliases: [],
    });
  }
  pushUnique(items, {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    tier: "fast",
    aliases: ["gemini", "gemini-flash"],
  });
  pushUnique(items, {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    tier: "reasoning",
    aliases: ["gemini-pro"],
  });
  if (idBelongsTo(c.gemini.flashModel, "gemini")) {
    pushUnique(items, {
      id: c.gemini.flashModel,
      label: `Gemini flash (${c.gemini.flashModel})`,
      provider: "gemini",
      tier: "fast",
      aliases: [],
    });
  }
  if (idBelongsTo(c.gemini.proModel, "gemini")) {
    pushUnique(items, {
      id: c.gemini.proModel,
      label: `Gemini pro (${c.gemini.proModel})`,
      provider: "gemini",
      tier: "reasoning",
      aliases: [],
    });
  }
  if (idBelongsTo(c.gemini.defaultModel, "gemini")) {
    pushUnique(items, {
      id: c.gemini.defaultModel,
      label: `Gemini (${c.gemini.defaultModel})`,
      provider: "gemini",
      tier: "balanced",
      aliases: [],
    });
  }
  pushUnique(items, {
    id: "grok-4.7",
    label: "Grok 4.7",
    provider: "grok",
    tier: "reasoning",
    aliases: ["grok", "xai"],
  });
  pushUnique(items, {
    id: "grok-4",
    label: "Grok 4",
    provider: "grok",
    tier: "balanced",
    aliases: [],
  });
  if (idBelongsTo(c.grok.defaultModel, "grok")) {
    pushUnique(items, {
      id: c.grok.defaultModel,
      label: `Grok (${c.grok.defaultModel})`,
      provider: "grok",
      tier: "balanced",
      aliases: [],
    });
  }
  return items;
}

export function findCatalogModel(raw?: string | null): CatalogModel | undefined {
  if (!raw) return undefined;
  const q = raw.trim().toLowerCase();
  return catalog().find((m) => m.id.toLowerCase() === q || m.aliases.some((a) => a.toLowerCase() === q));
}

export function normalizeModelId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const hit = findCatalogModel(raw);
  if (hit) return hit.id;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function inferProvider(modelId: string): Exclude<ProviderId, "mock"> {
  const hit = findCatalogModel(modelId);
  if (hit) return hit.provider;
  const id = modelId.toLowerCase();
  if (id.startsWith("grok") || id.startsWith("xai")) return "grok";
  if (id.startsWith("gemini") || id.startsWith("gemma")) return "gemini";
  return "openai";
}

/** Map a catalog / alias id to the id sent on the wire. */
export function wireModelId(canonical: string): string {
  const c = getConfig();
  const n = canonical.trim().toLowerCase();
  if (n === "gpt-6-luna" || n === "chatgpt-6-luna" || n === "chatgpt 6 luna" || n === "luna" || n === "chatgpt-6") {
    return c.openai.lunaModel;
  }
  if (n === "gemini" || n === "gemini-flash") return c.gemini.flashModel;
  if (n === "gemini-pro") return c.gemini.proModel;
  if (n === "grok" || n === "xai") return c.grok.defaultModel;
  return canonical;
}
