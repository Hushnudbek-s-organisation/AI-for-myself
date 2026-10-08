import { NextRequest } from "next/server";
import { AetherError } from "@/core/errors";
import type { AuthContext } from "@/core/types";
import { getConfig } from "@/core/config";

function hostOf(urlOrHost: string): string | null {
  try {
    if (urlOrHost.startsWith("http")) return new URL(urlOrHost).host;
    return urlOrHost;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated state changes must come from our own origin.
 * Bearer API keys skip CSRF (they are not cookie sessions).
 * Missing Origin is allowed for non-browser clients (curl, servers).
 */
export function assertCsrf(req: NextRequest, auth: AuthContext): void {
  if (auth.kind !== "session") return;
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  const app = getConfig().appUrl;
  const originHost = hostOf(origin);
  const allowed = [host, app ? hostOf(app) : null].filter(Boolean);
  if (originHost && allowed.includes(originHost)) return;
  throw new AetherError("csrf", "Invalid request origin", 403);
}
