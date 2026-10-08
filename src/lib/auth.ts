import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { AuthContext, UserRole } from "@/core/types";
import { users } from "@/db/repos";
import { AetherError } from "@/core/errors";
import { ensureSeeded } from "@/db/seed";
import { hashPassword, verifyPassword } from "@/lib/auth-hash";

export { hashPassword, verifyPassword };

const COOKIE = "aether_session";

function secret(): Uint8Array {
  const s = process.env.AETHER_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-change-me-aether-secret-key");
  if (!s) {
    throw new AetherError("misconfigured", "AETHER_SECRET is required", 500);
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: {
  userId: string;
  role: UserRole;
  email: string;
  name: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSession(token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = users.byId(String(payload.userId));
    if (!user) return null;
    return {
      kind: "session",
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      scopes: ["chat", "stream", "files", "voice", "tools", "skills", "memory"],
      projectId: null,
    };
  } catch {
    return null;
  }
}

export async function getSessionAuth(): Promise<AuthContext | null> {
  ensureSeeded();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return readSession(token);
}

export async function requireSession(): Promise<AuthContext> {
  const a = await getSessionAuth();
  if (!a) throw new AetherError("unauthorized", "Sign in required", 401);
  return a;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function guestOrSession(): Promise<AuthContext> {
  const existing = await getSessionAuth();
  if (existing) return existing;
  const email = `guest-${Date.now()}@local.aether`;
  const user = users.create({
    email,
    name: "Guest",
    role: "user",
  });
  const token = await signSession({
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  });
  await setSessionCookie(token);
  return {
    kind: "session",
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    scopes: ["chat", "stream", "files", "voice", "tools", "skills", "memory"],
  };
}
