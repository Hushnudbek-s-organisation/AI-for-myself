import { jsonError, jsonOk } from "@/lib/http";
import { guestOrSession } from "@/lib/auth";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function POST() {
  try {
    ensureSeeded();
    const auth = await guestOrSession();
    return jsonOk({
      user: { id: auth.userId, email: auth.email, name: auth.name, role: auth.role },
    });
  } catch (e) {
    return jsonError(e);
  }
}
