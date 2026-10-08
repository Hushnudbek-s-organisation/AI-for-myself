import { jsonOk, jsonError } from "@/lib/http";
import { ensureSeeded } from "@/db/seed";
import { getDb } from "@/db/index";
import { publicAiStatus, getConfig, LIVE_PROVIDER_IDS, type LiveProviderId } from "@/core/config";
import { resolveWireModels, summarizeOutcome, type PublicModelStatus } from "@/core/models/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureSeeded();
    let database: "ok" | "error" = "ok";
    try {
      getDb().prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    const ai = publicAiStatus();
    const cfg = getConfig();
    const resolved = ai.mock ? {} : await resolveWireModels(Number(process.env.AI_DISCOVERY_WAIT_MS || 1500));
    const models: Record<string, PublicModelStatus> = {};
    for (const p of LIVE_PROVIDER_IDS) models[p] = summarizeOutcome(resolved[p]);
    // Report the id actually used by default — never a name Aether has not verified.
    const active: LiveProviderId | null = ai.provider === "mock" || ai.provider === "unconfigured" ? null : ai.provider;
    const model = ai.mock ? "aether-engine-v1" : active ? models[active]?.wireModel ?? null : null;
    return jsonOk({
      ok: database === "ok" && (ai.configured || cfg.mockMode),
      app: "ok",
      database,
      ai: {
        provider: ai.provider,
        configured: ai.configured,
        mock: ai.mock,
        model,
        providers: ai.providers,
        models,
      },
      demoAccounts: cfg.allowDemoAccounts,
    });
  } catch (e) {
    return jsonError(e);
  }
}