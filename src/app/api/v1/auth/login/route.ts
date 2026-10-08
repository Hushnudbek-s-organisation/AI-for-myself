import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { users } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const body = Body.parse(await req.json());
    const user = users.byEmail(body.email);
    if (!user || !user.password_hash || !verifyPassword(body.password, user.password_hash)) {
      throw new AetherError("unauthorized", "Invalid email or password", 401);
    }
    const token = await signSession({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    await setSessionCookie(token);
    return jsonOk({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    return jsonError(e);
  }
}
