import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { rules } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";
import { detectInjection } from "@/core/security";

export const runtime = "nodejs";

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new AetherError("forbidden", "Admin only", 403);
  }
}

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const list = rules.list().map((r) => ({
      id: r.id,
      layer: r.layer,
      name: r.name,
      content: auth.role === "admin" || r.layer === "developer" || r.layer === "output" ? r.content : undefined,
      enabled: Boolean(r.enabled),
      version: r.version,
    }));
    return jsonOk({ rules: list });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  layer: z.enum(["developer", "output"]),
  name: z.string().min(1).max(80),
  content: z.string().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireAdmin(auth.role);
    const body = Body.parse(await req.json());
    const inj = detectInjection(body.content);
    if (inj.blocked) {
      throw new AetherError("skill_rejected", "Rule content failed security checks", 400);
    }
    const created = rules.create(body);
    return jsonOk({ rule: created }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
