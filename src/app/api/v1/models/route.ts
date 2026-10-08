import { jsonOk } from "@/lib/http";
import { listProviders } from "@/core/models/manager";
import { listModes } from "@/core/modes";
import { getConfig, publicAiStatus } from "@/core/config";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getConfig();
  const status = publicAiStatus();
  return jsonOk({
    providers: listProviders(),
    ai: status,
    models: status.mock
      ? [{ id: "aether-engine-v1", tier: "fast", mock: true }]
      : [
          { id: cfg.models.fast, tier: "fast" },
          { id: cfg.models.default, tier: "balanced" },
          { id: cfg.models.reasoning, tier: "reasoning" },
        ],
    modes: listModes().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    })),
  });
}
