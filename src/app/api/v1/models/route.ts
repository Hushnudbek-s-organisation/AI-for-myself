import { jsonOk } from "@/lib/http";
import { listProviders, listPublicModels, defaultModel, describeModels } from "@/core/models/manager";
import { listModes } from "@/core/modes";
import { publicAiStatus, LIVE_PROVIDER_IDS } from "@/core/config";
import { summarizeOutcome } from "@/core/models/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = publicAiStatus();
  // Short, best-effort: the picker only needs provider names, the wire id is a bonus.
  const resolved = await describeModels(Number(process.env.AI_DISCOVERY_WAIT_MS || 1500));
  const models = Object.fromEntries(LIVE_PROVIDER_IDS.map((p) => [p, summarizeOutcome(resolved[p])]));
  const active =
    status.provider === "mock" || status.provider === "unconfigured" ? null : status.provider;
  return jsonOk({
    providers: listProviders(),
    ai: { ...status, model: status.mock ? status.model : active ? models[active]?.wireModel ?? null : null, models },
    defaultModel: defaultModel(),
    models: listPublicModels(resolved),
    modes: listModes().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    })),
  });
}