import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { apiKeys } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const ok = apiKeys.revoke(id, auth.userId);
    if (!ok) throw new AetherError("not_found", "Key not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
