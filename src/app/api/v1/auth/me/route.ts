import { jsonError, jsonOk } from "@/lib/http";
import { getSessionAuth } from "@/lib/auth";
import { instructions } from "@/db/repos";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureSeeded();
    const auth = await getSessionAuth();
    if (!auth) return jsonOk({ user: null });
    const custom = instructions.get(auth.userId);
    return jsonOk({
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
        role: auth.role,
      },
      customInstructions: custom,
    });
  } catch (e) {
    return jsonError(e);
  }
}
