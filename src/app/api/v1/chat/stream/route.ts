import { NextRequest } from "next/server";
import { z } from "zod";
import { MODE_IDS } from "@/core/types";
import { runChat } from "@/core/gateway";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, sse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ensureSeeded } from "@/db/seed";
import { corsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().min(1).max(32_000),
  conversationId: z.string().optional(),
  mode: z.enum(MODE_IDS).optional(),
  skill: z.string().optional(),
  skillId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  files: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string(),
        mime: z.string(),
        size: z.number(),
        extractedText: z.string().optional(),
      }),
    )
    .optional(),
  model: z.string().optional(),
  editOf: z.string().optional(),
  regenerateOf: z.string().optional(),
});

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "stream");
    rateLimit(`stream:${auth.keyId || auth.userId}`, auth.rateLimitRpm || 60);
    const body = Body.parse(await req.json());
    return sse(runChat(auth, body, { abort: req.signal }), req.signal);
  } catch (e) {
    return jsonError(e);
  }
}
