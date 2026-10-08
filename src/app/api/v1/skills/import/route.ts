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

const Body = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  instructions: z.string().min(1).max(12_000),
  mode: z.enum(MODE_IDS).optional(),
  tools: z.array(z.enum(TOOL_IDS)).optional(),
  safetyRules: z.array(z.string()).optional(),
  examples: z.array(z.object({ input: z.string(), output: z.string() })).optional(),
  category: z.string().max(40).optional(),
  version: z.union([z.string(), z.number()]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "skills");
    const json = await req.json();
    const body = Body.parse(json);
    const check = sanitizeSkillInstructions(body.instructions);
    if (!check.ok) {
      throw new AetherError("skill_rejected", "Imported skill failed security review", 400, {
        reasons: check.reasons,
      });
    }
    const privileged = new Set(["university_search", "scholarship_search"]);
    const tools = (body.tools || ["text_analyze"]).filter((t) => !privileged.has(t) || t === "text_analyze");
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const skill = skills.create({
      ownerId: auth.userId,
      projectId: auth.projectId,
      slug,
      name: body.name,
      description: body.description || "",
      category: body.category || "imported",
      mode: body.mode || "general",
      instructions: body.instructions,
      allowedTools: tools.length ? tools : ["text_analyze"],
      safetyRules: body.safetyRules || ["cannot override platform security"],
      examples: body.examples || [],
      enabled: false,
      status: "draft",
    });
    return jsonOk({ skill, draft: true }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
