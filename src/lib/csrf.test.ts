import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { assertCsrf } from "./csrf";
import type { AuthContext } from "@/core/types";
import { AetherError } from "@/core/errors";

const session: AuthContext = {
  kind: "session",
  userId: "usr_1",
  role: "user",
  scopes: ["chat"],
};

const key: AuthContext = {
  kind: "api_key",
  userId: "usr_1",
  role: "user",
  scopes: ["chat"],
  projectId: "proj_1",
};

function req(method: string, origin?: string, host = "localhost:3000") {
  const headers: Record<string, string> = { host };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost:3000/api/v1/chat", { method, headers });
}

describe("csrf", () => {
  it("skips API keys", () => {
    expect(() => assertCsrf(req("POST", "https://evil.test"), key)).not.toThrow();
  });

  it("allows same-origin cookie POST", () => {
    expect(() => assertCsrf(req("POST", "http://localhost:3000"), session)).not.toThrow();
  });

  it("blocks cross-origin cookie POST", () => {
    expect(() => assertCsrf(req("POST", "https://evil.test"), session)).toThrow(AetherError);
  });

  it("allows missing origin (non-browser)", () => {
    expect(() => assertCsrf(req("POST"), session)).not.toThrow();
  });
});
