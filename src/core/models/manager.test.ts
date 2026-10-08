import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAllowedModel, resolveProvider } from "./manager";
import { AetherError } from "../errors";

const KEYS = ["AI_MOCK_MODE", "OPENAI_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "GROK_API_KEY"] as const;

describe("model manager", () => {
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

  it("uses mock provider when AI_MOCK_MODE is set", () => {
    process.env.AI_MOCK_MODE = "true";
    const r = resolveProvider("anything");
    expect(r.mock).toBe(true);
    expect(r.provider.id).toBe("aether-builtin");
  });

  it("enforces project model allow-lists", () => {
    expect(isAllowedModel("gpt-5.5", [])).toBe(true);
    expect(isAllowedModel("gpt-5.5", ["gpt-5.5"])).toBe(true);
    expect(isAllowedModel("secret-model", ["gpt-5.5"])).toBe(false);
    expect(isAllowedModel("chatgpt-6-luna", ["gpt-6-luna"])).toBe(true);
  });

  it("does not silently use OpenAI when Gemini is requested without a Gemini key", () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.GEMINI_API_KEY;
    expect(() => resolveProvider("gemini-2.5-flash")).toThrow(AetherError);
    try {
      resolveProvider("gemini-2.5-flash");
    } catch (e) {
      expect(e).toBeInstanceOf(AetherError);
      expect((e as AetherError).code).toBe("ai_unconfigured");
      expect((e as AetherError).message).toMatch(/GEMINI_API_KEY/);
    }
  });

  it("routes Gemini and Grok to their providers when keys exist", () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gem-test";
    process.env.XAI_API_KEY = "xai-test";
    const g = resolveProvider("gemini-2.5-flash");
    expect(g.mock).toBe(false);
    expect(g.provider.id).toBe("gemini");
    expect(g.model).toBe("gemini-2.5-flash");
    const x = resolveProvider("grok-4.7");
    expect(x.provider.id).toBe("grok");
    const luna = resolveProvider("chatgpt-6-luna");
    expect(luna.provider.id).toBe("openai");
    expect(luna.catalogId).toBe("gpt-6-luna");
  });
});
