import { NextRequest } from "next/server";
import { z } from "zod";
import { MODE_IDS } from "@/core/types";
import { runChat, runChatSync } from "@/core/gateway";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, jsonOk, sse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ensureSeeded } from "@/db/seed";
import { applyCors, corsPreflight } from "@/lib/cors";
import { log } from "@/core/log";

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
  stream: z.boolean().optional(),
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
    requireScope(auth, "chat");
    const rpm = auth.rateLimitRpm || 60;
    rateLimit(`chat:${auth.keyId || auth.userId}`, rpm);
    const body = Body.parse(await req.json());
    if (body.stream) {
      requireScope(auth, "stream");
      return sse(runChat(auth, body, { abort: req.signal }), req.signal);
    }
    const response = await runChatSync(auth, body, { abort: req.signal });
    const res = jsonOk(response);
    return applyCors(req, res, auth);
  } catch (e) {
    log("warn", "chat.post_error", { userId: "redacted" });
    return jsonError(e);
  }
}
