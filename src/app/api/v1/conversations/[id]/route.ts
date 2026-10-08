import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { conversations, messages } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { z } from "zod";
import { MODE_IDS } from "@/core/types";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(_req);
    const { id } = await ctx.params;
    const conv = conversations.get(id, auth.userId);
    if (!conv) throw new AetherError("not_found", "Conversation not found", 404);
    const msgs = messages.list(id);
    return jsonOk({ conversation: conv, messages: msgs });
  } catch (e) {
    return jsonError(e);
  }
}

const Patch = z.object({
  title: z.string().min(1).max(120).optional(),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  mode: z.enum(MODE_IDS).optional(),
  skillId: z.string().nullable().optional(),
  clear: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const body = Patch.parse(await req.json());
    if (body.clear) messages.clear(id);
    const conv = conversations.update(id, auth.userId, body);
    if (!conv) throw new AetherError("not_found", "Conversation not found", 404);
    return jsonOk({ conversation: conv });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const ok = conversations.remove(id, auth.userId);
    if (!ok) throw new AetherError("not_found", "Conversation not found", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
