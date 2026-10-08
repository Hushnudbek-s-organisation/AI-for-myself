import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { skills } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const skill = skills.get(id, auth.userId);
    if (!skill) throw new AetherError("not_found", "Skill not found", 404);
    return jsonOk({
      name: skill.name,
      version: String(skill.version),
      description: skill.description,
      instructions: skill.instructions,
      mode: skill.mode,
      tools: skill.allowedTools,
      safetyRules: skill.safetyRules,
      examples: skill.examples,
      category: skill.category,
    });
  } catch (e) {
    return jsonError(e);
  }
}
