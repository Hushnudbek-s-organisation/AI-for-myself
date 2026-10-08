import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { projects } from "@/db/repos";
import { parseJson } from "@/db/index";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const list = projects.list(auth.userId).map((p) => ({
      ...p,
      allowed_origins: parseJson(p.allowed_origins, []),
      enabled_modes: parseJson(p.enabled_modes, []),
      enabled_skills: parseJson(p.enabled_skills, []),
      allowed_models: parseJson(p.allowed_models, []),
    }));
    return jsonOk({ projects: list });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const body = Body.parse(await req.json());
    const project = projects.create(auth.userId, body.name);
    return jsonOk({ project }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
