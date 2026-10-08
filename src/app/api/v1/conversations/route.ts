import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { conversations } from "@/db/repos";
import { MODE_IDS } from "@/core/types";
import { z } from "zod";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const q = req.nextUrl.searchParams.get("q") || undefined;
    const archived = req.nextUrl.searchParams.get("archived") === "1";
    return jsonOk({ conversations: conversations.list(auth.userId, { q, archived }) });
  } catch (e) {
    return jsonError(e);
  }
}

const Create = z.object({
  title: z.string().optional(),
  mode: z.enum(MODE_IDS).optional(),
  skillId: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const body = Create.parse(await req.json().catch(() => ({})));
    const conv = conversations.create({
      userId: auth.userId,
      projectId: auth.projectId,
      title: body.title,
      mode: body.mode,
      skillId: body.skillId,
      model: body.model,
    });
    return jsonOk({ conversation: conv }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
