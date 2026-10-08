import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/http";
import { hashPassword, setSessionCookie, signSession } from "@/lib/auth";
import { users } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const body = Body.parse(await req.json());
    if (users.byEmail(body.email)) {
      throw new AetherError("conflict", "Email already registered", 409);
    }
    const user = users.create({
      email: body.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: "user",
    });
    const token = await signSession({
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    await setSessionCookie(token);
    return jsonOk({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
