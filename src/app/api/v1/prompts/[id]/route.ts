import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { prompts } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { MODE_IDS } from "@/core/types";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const prompt = prompts.get(id, auth.userId, auth.role);
    if (!prompt) throw new AetherError("not_found", "Prompt not found", 404);
    return jsonOk({ prompt });
  } catch (e) {
    return jsonError(e);
  }
}

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).optional(),
  content: z.string().min(1).max(12_000).optional(),
  mode: z.enum(MODE_IDS).nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const body = Patch.parse(await req.json());
    const prompt = prompts.update(id, auth.userId, body);
    if (!prompt) throw new AetherError("not_found", "Prompt not found", 404);
    return jsonOk({ prompt });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const ok = prompts.remove(id, auth.userId);
    if (!ok) throw new AetherError("not_found", "Prompt not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
