import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionAuth } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { instructions } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureSeeded();
    const auth = await getSessionAuth();
    if (!auth) throw new AetherError("unauthorized", "Sign in required", 401);
    return jsonOk({ customInstructions: instructions.get(auth.userId) });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  about_user: z.string().max(4000).optional(),
  response_style: z.string().max(2000).optional(),
  language: z.string().max(80).optional(),
  enabled: z.number().min(0).max(1).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await getSessionAuth();
    if (!auth) throw new AetherError("unauthorized", "Sign in required", 401);
    const body = Body.parse(await req.json());
    const saved = instructions.upsert(auth.userId, body);
    return jsonOk({ customInstructions: saved });
  } catch (e) {
    return jsonError(e);
  }
}
