import { NextRequest } from "next/server";
import { authFromRequest } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { usage } from "@/db/repos";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    return jsonOk(usage.summary(auth.userId));
  } catch (e) {
    return jsonError(e);
  }
}
