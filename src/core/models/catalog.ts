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

/**
 * User-facing choices are the three APIs. Wire model IDs stay on the server
 * (optional env override). Unknown ids still route by prefix.
 */
export function catalog(): CatalogModel[] {
  return [
    {
      id: "chatgpt",
      label: "ChatGPT",
      provider: "openai",
      tier: "reasoning",
      aliases: [
        "openai",
        "gpt-6-luna",
        "chatgpt-6-luna",
        "chatgpt 6 luna",
        "luna",
        "chatgpt-6",
        "gpt-6-astra",
        "gpt-6",
        "gpt-5.5",
      ],
    },
    {
      id: "gemini",
      label: "Gemini",
      provider: "gemini",
      tier: "balanced",
      aliases: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash", "gemini-pro", "google"],
    },
    {
      id: "grok",
      label: "Grok",
      provider: "grok",
      tier: "balanced",
      aliases: ["xai", "grok-4.7", "grok-4"],
    },
  ];
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

/** Map a picker / alias id to the id sent on the wire. */
export function wireModelId(canonical: string): string {
  const c = getConfig();
  const hit = findCatalogModel(canonical);
  if (!hit) return canonical;
  if (hit.provider === "openai") return c.openai.defaultModel;
  if (hit.provider === "gemini") return c.gemini.defaultModel;
  return c.grok.defaultModel;
}
