import { NextRequest } from "next/server";
import type { AuthContext } from "@/core/types";
import { parseJson } from "@/db/index";
import { lookupApiKey, keyScopes } from "./api-key";
import { readSession } from "./auth";
import { projects, users } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";
import { assertCsrf } from "./csrf";

export async function authFromRequest(req: NextRequest): Promise<AuthContext> {
  ensureSeeded();
  const header = req.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const apiKeyHeader = req.headers.get("x-api-key") || "";
  const raw = bearer.startsWith("aether_sk_") ? bearer : apiKeyHeader || (bearer.startsWith("aether_sk_") ? bearer : "");

  if (raw.startsWith("aether_sk_") || apiKeyHeader.startsWith("aether_sk_")) {
    const key = lookupApiKey(raw.startsWith("aether_sk_") ? raw : apiKeyHeader);
    if (!key) throw new AetherError("unauthorized", "Invalid API key", 401);
    const owner = users.byId(key.owner_id);
    const project = projects.get(key.project_id);
    return {
      kind: "api_key",
      userId: key.owner_id,
      role: owner?.role ?? "user",
      projectId: key.project_id,
      scopes: keyScopes(key),
      keyId: key.id,
      email: owner?.email,
      name: project?.name || owner?.name,
      rateLimitRpm: key.rate_limit_rpm,
    };
  }

  if (bearer) {
    const session = await readSession(bearer);
    if (session) return withCsrf(req, session);
  }

  const cookie = req.cookies.get("aether_session")?.value;
  if (cookie) {
    const session = await readSession(cookie);
    if (session) return withCsrf(req, session);
  }

  throw new AetherError("unauthorized", "Authentication required", 401);
}

function withCsrf(req: NextRequest, auth: AuthContext): AuthContext {
  assertCsrf(req, auth);
  return auth;
}

export function requireScope(auth: AuthContext, scope: AuthContext["scopes"][number]) {
  if (!auth.scopes.includes(scope)) {
    throw new AetherError("forbidden", `Missing scope: ${scope}`, 403);
  }
}

export function projectAllowsMode(projectJson: string | undefined, mode: string): boolean {
  const allowed = parseJson<string[]>(projectJson ?? "[]", []);
  if (!allowed.length) return true;
  return allowed.includes(mode);
}
