import { describe, expect, it } from "vitest";
import { inferProvider, normalizeModelId, wireModelId } from "./catalog";

describe("model catalog", () => {
  it("maps ChatGPT aliases to the chatgpt picker id", () => {
    expect(normalizeModelId("chatgpt-6-luna")).toBe("chatgpt");
    expect(normalizeModelId("ChatGPT 6 Luna")).toBe("chatgpt");
    expect(normalizeModelId("luna")).toBe("chatgpt");
    expect(normalizeModelId("openai")).toBe("chatgpt");
    expect(inferProvider("gpt-6-luna")).toBe("openai");
  });

  it("routes Gemini and Grok by prefix and aliases", () => {
    expect(normalizeModelId("gemini-2.5-pro")).toBe("gemini");
    expect(inferProvider("gemini-flash")).toBe("gemini");
    expect(normalizeModelId("grok-4.7")).toBe("grok");
    expect(inferProvider("xai")).toBe("grok");
  });

  it("remaps ChatGPT to OPENAI_MODEL / OPENAI_MODEL_LUNA on the wire", () => {
    const prevLuna = process.env.OPENAI_MODEL_LUNA;
    const prevOpen = process.env.OPENAI_MODEL;
    const prevDefault = process.env.AI_MODEL_DEFAULT;
    delete process.env.OPENAI_MODEL;
    delete process.env.AI_MODEL_DEFAULT;
    process.env.OPENAI_MODEL_LUNA = "gpt-custom-luna";
    expect(wireModelId("chatgpt")).toBe("gpt-custom-luna");
    expect(wireModelId("gpt-6-luna")).toBe("gpt-custom-luna");
    if (prevLuna === undefined) delete process.env.OPENAI_MODEL_LUNA;
    else process.env.OPENAI_MODEL_LUNA = prevLuna;
    if (prevOpen === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = prevOpen;
    if (prevDefault === undefined) delete process.env.AI_MODEL_DEFAULT;
    else process.env.AI_MODEL_DEFAULT = prevDefault;
  });
});
