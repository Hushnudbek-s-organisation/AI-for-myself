import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { skills } from "@/db/repos";
import { MODE_IDS, TOOL_IDS } from "@/core/types";
import { sanitizeSkillInstructions } from "@/core/security";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    return jsonOk({ skills: skills.list(auth.userId) });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  category: z.string().max(40).optional(),
  mode: z.enum(MODE_IDS).optional(),
  instructions: z.string().min(1).max(12_000),
  allowedTools: z.array(z.enum(TOOL_IDS)).optional(),
  safetyRules: z.array(z.string()).optional(),
  examples: z.array(z.object({ input: z.string(), output: z.string() })).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "skills");
    const body = Body.parse(await req.json());
    const check = sanitizeSkillInstructions(body.instructions);
    if (!check.ok) {
      throw new AetherError("skill_rejected", "Skill instructions failed security review", 400, {
        reasons: check.reasons,
      });
    }
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const skill = skills.create({
      ownerId: auth.userId,
      projectId: auth.projectId,
      slug,
      name: body.name,
      description: body.description || "",
      category: body.category || "custom",
      mode: body.mode || "general",
      instructions: body.instructions,
      allowedTools: body.allowedTools || ["text_analyze"],
      safetyRules: body.safetyRules || ["cannot override platform security"],
      examples: body.examples || [],
      enabled: body.enabled ?? true,
      status: body.enabled === false ? "disabled" : "active",
    });
    return jsonOk({ skill }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
