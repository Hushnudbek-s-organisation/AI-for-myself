import type { ModelTier } from "../types";
import { PROVIDER_LABEL, type LiveProviderId } from "../config";

export type ProviderId = "openai" | "gemini" | "grok" | "mock";

/**
 * The chat picker speaks provider names only: ChatGPT / Gemini / Grok.
 * Wire ids (gpt-*, gemini-*, grok-*) are resolved server-side from the live
 * model list for the configured key, or from an optional env override.
 */
export type PickerId = "chatgpt" | "gemini" | "grok";

/** What gets stored on a conversation / echoed in the API. */
export type CatalogId = PickerId | "aether-engine-v1";

export const PICKER_IDS: PickerId[] = ["chatgpt", "gemini", "grok"];

export const PICKER_FOR_PROVIDER: Record<LiveProviderId, PickerId> = {
  openai: "chatgpt",
  gemini: "gemini",
  grok: "grok",
};

export const PROVIDER_FOR_PICKER: Record<PickerId, LiveProviderId> = {
  chatgpt: "openai",
  gemini: "gemini",
  grok: "grok",
};

export interface CatalogModel {
  id: PickerId;
  label: string;
  provider: LiveProviderId;
  tier: ModelTier;
  aliases: string[];
}

/**
 * Provider-level aliases only. Anything else a client sends is routed by prefix
 * (see normalizeModelId) and never becomes a wire id — no model name is baked in.
 */
const ALIASES: Record<PickerId, string[]> = {
  chatgpt: ["chatgpt", "chat-gpt", "openai", "gpt"],
  gemini: ["gemini", "google", "google-gemini", "gemini-flash"],
  grok: ["grok", "xai", "x-ai"],
};

function normalize(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isPickerId(value: string): value is PickerId {
  return (PICKER_IDS as string[]).includes(value);
}

export function catalog(): CatalogModel[] {
  return [
    {
      id: "chatgpt",
      label: PROVIDER_LABEL.openai,
      provider: "openai",
      tier: "balanced",
      aliases: ALIASES.chatgpt,
    },
    {
      id: "gemini",
      label: PROVIDER_LABEL.gemini,
      provider: "gemini",
      tier: "balanced",
      aliases: ALIASES.gemini,
    },
    {
      id: "grok",
      label: PROVIDER_LABEL.grok,
      provider: "grok",
      tier: "balanced",
      aliases: ALIASES.grok,
    },
  ];
}

export function findCatalogModel(raw?: string | null): CatalogModel | undefined {
  const q = normalize(raw);
  if (!q) return undefined;
  return catalog().find((m) => m.id === q || m.aliases.includes(q));
}

/** Picker id for anything a client might send. Returns undefined for blank input. */
export function normalizeModelId(raw?: string | null): PickerId | undefined {
  const q = normalize(raw);
  if (!q) return undefined;
  const hit = findCatalogModel(q);
  if (hit) return hit.id;
  // Unknown concrete ids still tell us which provider was meant (keeps old links working).
  if (q.startsWith("gemini") || q.startsWith("gemma")) return "gemini";
  if (q.startsWith("grok") || q.startsWith("xai") || q.startsWith("x-ai")) return "grok";
  return "chatgpt";
}

export function inferProvider(modelId: string): LiveProviderId {
  return PROVIDER_FOR_PICKER[normalizeModelId(modelId) ?? "chatgpt"];
}