import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfig, publicAiStatus, requireRealProviderOrMock } from "./config";
import { AetherError } from "./errors";

const KEYS = [
  "AI_MOCK_MODE",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "ALLOW_DEMO_ACCOUNTS",
] as const;

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
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.GROK_API_KEY;
    expect(() => requireRealProviderOrMock()).toThrow(AetherError);
  });

  it("accepts Gemini-only or Grok-only configuration", () => {
    process.env.AI_MOCK_MODE = "false";
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "gem-test";
    expect(requireRealProviderOrMock()).toBe("gemini");
    expect(publicAiStatus().providers.gemini).toBe(true);
    delete process.env.GEMINI_API_KEY;
    process.env.XAI_API_KEY = "xai-test";
    expect(requireRealProviderOrMock()).toBe("grok");
  });

  it("does not allow demo accounts when flag is false", () => {
    process.env.ALLOW_DEMO_ACCOUNTS = "false";
    expect(getConfig().allowDemoAccounts).toBe(false);
  });

  it("ships no model id at all — free ids are resolved from the key, never hardcoded", () => {
    delete process.env.OPENAI_MODEL;
    delete process.env.AI_MODEL_DEFAULT;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_DEFAULT;
    delete process.env.GROK_MODEL;
    delete process.env.XAI_MODEL;
    const c = getConfig();
    expect(c.models).toEqual({ openai: "", gemini: "", grok: "" });
    const serialized = JSON.stringify(c);
    expect(serialized).not.toMatch(/gpt-6-luna|gpt-5\.5|gpt-6-astra|grok-4\.7|gemini-2\.5-pro|gemini-2\.5-flash/);
  });

  it("reads optional free-tier overrides only when the operator sets them", () => {
    process.env.AI_MOCK_MODE = "false";
    delete process.env.OPENAI_MODEL;
    process.env.GEMINI_MODEL = "gemini-2.0-flash";
    process.env.GROK_MODEL = "grok-3-mini";
    expect(getConfig().models.gemini).toBe("gemini-2.0-flash");
    expect(getConfig().models.grok).toBe("grok-3-mini");
    expect(getConfig().models.openai).toBe("");
    expect(publicAiStatus().model).toBeNull();
  });
});
