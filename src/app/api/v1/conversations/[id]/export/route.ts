import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError } from "@/lib/http";
import { conversations, messages } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const conv = conversations.get(id, auth.userId);
    if (!conv) throw new AetherError("not_found", "Conversation not found", 404);
    const msgs = messages.list(id).map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      mode: m.mode,
      skillId: m.skillId,
    }));
    const format = req.nextUrl.searchParams.get("format") || "json";
    if (format === "md" || format === "markdown") {
      const md = [`# ${conv.title}`, "", ...msgs.map((m) => `## ${m.role}\n\n${m.content}\n`)].join("\n");
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    if (format === "txt") {
      const txt = msgs.map((m) => `${m.role.toUpperCase()}:\n${m.content}\n`).join("\n");
      return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return Response.json({
      conversation: { id: conv.id, title: conv.title, mode: conv.mode, skillId: conv.skillId },
      messages: msgs,
    });
  } catch (e) {
    return jsonError(e);
  }
}
