import { jsonOk } from "@/lib/http";
import { listProviders, listPublicModels, defaultModel } from "@/core/models/manager";
import { listModes } from "@/core/modes";
import { publicAiStatus } from "@/core/config";

export const runtime = "nodejs";

export async function GET() {
  const status = publicAiStatus();
  return jsonOk({
    providers: listProviders(),
    ai: status,
    defaultModel: defaultModel(),
    models: listPublicModels(),
    modes: listModes().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    })),
  });
}
