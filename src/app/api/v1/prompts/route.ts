import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { prompts } from "@/db/repos";
import { MODE_IDS } from "@/core/types";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    return jsonOk({ prompts: prompts.list(auth.userId, auth.role) });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional(),
  content: z.string().min(1).max(12_000),
  mode: z.enum(MODE_IDS).optional(),
  kind: z.enum(["user", "task"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const body = Body.parse(await req.json());
    const p = prompts.create({
      ownerId: auth.userId,
      name: body.name,
      description: body.description || "",
      content: body.content,
      mode: body.mode,
      kind: body.kind || "task",
    });
    return jsonOk({ prompt: p }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
