import { jsonOk } from "@/lib/http";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
