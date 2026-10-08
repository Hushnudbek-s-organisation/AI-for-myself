import { describe, expect, it } from "vitest";
import { inferProvider, normalizeModelId, wireModelId } from "./catalog";

describe("model catalog", () => {
  it("maps ChatGPT 6 Luna aliases to gpt-6-luna", () => {
    expect(normalizeModelId("chatgpt-6-luna")).toBe("gpt-6-luna");
    expect(normalizeModelId("ChatGPT 6 Luna")).toBe("gpt-6-luna");
    expect(normalizeModelId("luna")).toBe("gpt-6-luna");
    expect(inferProvider("gpt-6-luna")).toBe("openai");
  });

  it("routes Gemini and Grok by prefix and aliases", () => {
    expect(inferProvider("gemini-2.5-pro")).toBe("gemini");
    expect(inferProvider("gemini-flash")).toBe("gemini");
    expect(inferProvider("grok-4.7")).toBe("grok");
    expect(inferProvider("xai")).toBe("grok");
  });

  it("remaps Luna to OPENAI_MODEL_LUNA on the wire", () => {
    const prev = process.env.OPENAI_MODEL_LUNA;
    process.env.OPENAI_MODEL_LUNA = "gpt-custom-luna";
    expect(wireModelId("gpt-6-luna")).toBe("gpt-custom-luna");
    if (prev === undefined) delete process.env.OPENAI_MODEL_LUNA;
    else process.env.OPENAI_MODEL_LUNA = prev;
  });
});
