import { jsonOk, jsonError } from "@/lib/http";
import { ensureSeeded } from "@/db/seed";
import { getDb } from "@/db/index";
import { publicAiStatus, getConfig } from "@/core/config";

export const runtime = "nodejs";

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
    return jsonOk({
      ok: database === "ok" && (ai.configured || cfg.mockMode),
      app: "ok",
      database,
      ai: {
        provider: ai.provider,
        configured: ai.configured,
        mock: ai.mock,
        model: ai.model,
        providers: ai.providers,
      },
      demoAccounts: cfg.allowDemoAccounts,
    });
  } catch (e) {
    return jsonError(e);
  }
}
