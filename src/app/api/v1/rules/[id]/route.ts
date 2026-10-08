import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { rules } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";
import { detectInjection } from "@/core/security";

export const runtime = "nodejs";

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new AetherError("forbidden", "Admin only", 403);
  }
}

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  content: z.string().min(1).max(8000).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireAdmin(auth.role);
    const { id } = await ctx.params;
    const body = Patch.parse(await req.json());
    if (body.content) {
      const inj = detectInjection(body.content);
      if (inj.blocked) {
        throw new AetherError("skill_rejected", "Rule content failed security checks", 400);
      }
    }
    const updated = rules.update(id, body);
    if (!updated) throw new AetherError("not_found", "Rule not found or locked", 404);
    return jsonOk({ rule: updated });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireAdmin(auth.role);
    const { id } = await ctx.params;
    if (!rules.remove(id)) throw new AetherError("not_found", "Rule not found or locked", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
