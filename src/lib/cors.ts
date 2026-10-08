import { NextRequest, NextResponse } from "next/server";
import type { AuthContext } from "@/core/types";
import { parseJson } from "@/db/index";
import { projects } from "@/db/repos";

export function applyCors(req: NextRequest, res: NextResponse, auth: AuthContext): NextResponse {
  if (auth.kind !== "api_key" || !auth.projectId) return res;
  const origin = req.headers.get("origin");
  if (!origin) return res;
  const project = projects.get(auth.projectId);
  const allowed = parseJson<string[]>(project?.allowed_origins ?? "[]", []);
  if (!allowed.length) return res;
  if (allowed.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  return res;
}

export function corsPreflight(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin") || "";
  const res = new NextResponse(null, { status: 204 });
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}
