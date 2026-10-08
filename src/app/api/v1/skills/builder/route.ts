import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { draftSkillFromDescription } from "@/core/skills/builder";
import { skills } from "@/db/repos";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

const Body = z.object({
  description: z.string().min(8).max(2000),
  saveDraft: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "skills");
    const body = Body.parse(await req.json());
    const draft = draftSkillFromDescription(body.description, auth.userId);
    if (body.saveDraft) {
      const saved = skills.create({
        ...draft,
        ownerId: auth.userId,
        enabled: false,
        status: "draft",
      });
      return jsonOk({ skill: saved, draft: true });
    }
    return jsonOk({ skill: draft, draft: true, saved: false });
  } catch (e) {
    return jsonError(e);
  }
}
