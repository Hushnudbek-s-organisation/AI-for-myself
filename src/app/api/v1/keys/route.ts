import { NextRequest } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { apiKeys, projects } from "@/db/repos";
import { createApiKey, maskKey } from "@/lib/api-key";
import { API_SCOPES } from "@/core/types";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const list = apiKeys.list(auth.userId).map((k) => ({
      id: k.id,
      projectId: k.project_id,
      name: k.name,
      prefix: maskKey(k.key_prefix),
      scopes: JSON.parse(k.scopes),
      rateLimitRpm: k.rate_limit_rpm,
      lastUsedAt: k.last_used_at,
      revokedAt: k.revoked_at,
      createdAt: k.created_at,
    }));
    return jsonOk({ keys: list });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES)).optional(),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    const body = Body.parse(await req.json());
    let projectId = body.projectId;
    if (!projectId) {
      const p = projects.create(auth.userId, body.projectName || "Default project");
      projectId = p.id;
    } else {
      const p = projects.get(projectId, auth.userId);
      if (!p) throw new AetherError("not_found", "Project not found", 404);
    }
    const { row, plaintext } = createApiKey({
      projectId,
      ownerId: auth.userId,
      name: body.name,
      scopes: body.scopes || ["chat", "stream"],
    });
    return jsonOk(
      {
        key: {
          id: row.id,
          name: row.name,
          projectId: row.project_id,
          scopes: JSON.parse(row.scopes),
          createdAt: row.created_at,
          plaintext,
          warning: "Copy this key now. It will not be shown again.",
        },
      },
      201,
    );
  } catch (e) {
    return jsonError(e);
  }
}
