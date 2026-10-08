import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig, publicAiStatus, requireRealProviderOrMock } from "./config";
import { AetherError } from "./errors";

const KEYS = ["AI_MOCK_MODE", "OPENAI_API_KEY", "ALLOW_DEMO_ACCOUNTS"] as const;

describe("config", () => {
  const snap: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) snap[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  it("treats mock as explicit", () => {
    process.env.AI_MOCK_MODE = "true";
    delete process.env.OPENAI_API_KEY;
    expect(getConfig().mockMode).toBe(true);
    expect(requireRealProviderOrMock()).toBe("mock");
    expect(publicAiStatus().mock).toBe(true);
  });

  it("refuses silent fallback when mock is off and no key", () => {
    process.env.AI_MOCK_MODE = "false";
    delete process.env.OPENAI_API_KEY;
    expect(() => requireRealProviderOrMock()).toThrow(AetherError);
  });

  it("does not allow demo accounts when flag is false", () => {
    process.env.ALLOW_DEMO_ACCOUNTS = "false";
    expect(getConfig().allowDemoAccounts).toBe(false);
  });
});
