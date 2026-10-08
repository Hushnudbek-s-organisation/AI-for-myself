import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { skills } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { MODE_IDS, TOOL_IDS } from "@/core/types";
import { sanitizeSkillInstructions } from "@/core/security";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const { id } = await ctx.params;
    const skill = skills.get(id, auth.userId);
    if (!skill) throw new AetherError("not_found", "Skill not found", 404);
    const versions = skills.versions(skill.id);
    return jsonOk({ skill, versions });
  } catch (e) {
    return jsonError(e);
  }
}

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  instructions: z.string().min(1).max(12_000).optional(),
  mode: z.enum(MODE_IDS).optional(),
  allowedTools: z.array(z.enum(TOOL_IDS)).optional(),
  safetyRules: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  rollbackTo: z.number().optional(),
  newVersion: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "skills");
    const { id } = await ctx.params;
    const body = Patch.parse(await req.json());
    if (body.rollbackTo) {
      const rolled = skills.rollback(id, auth.userId, body.rollbackTo);
      if (!rolled) throw new AetherError("not_found", "Version not found", 404);
      return jsonOk({ skill: rolled });
    }
    if (body.instructions) {
      const check = sanitizeSkillInstructions(body.instructions);
      if (!check.ok) {
        throw new AetherError("skill_rejected", "Skill instructions failed security review", 400, {
          reasons: check.reasons,
        });
      }
    }
    const skill = skills.update(
      id,
      auth.userId,
      {
        ...body,
        enabled: body.enabled,
        status: body.enabled === false ? "disabled" : body.enabled ? "active" : undefined,
      },
      body.newVersion !== false,
    );
    if (!skill) throw new AetherError("not_found", "Skill not found or not owned", 404);
    return jsonOk({ skill });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "skills");
    const { id } = await ctx.params;
    const ok = skills.remove(id, auth.userId);
    if (!ok) throw new AetherError("not_found", "Skill not found or not owned", 404);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
