import { describe, expect, it } from "vitest";
import { catalog, inferProvider, normalizeModelId, PICKER_IDS } from "./catalog";

describe("model catalog", () => {
  it("shows provider names, not raw wire ids", () => {
    expect(catalog().map((m) => m.id)).toEqual(["chatgpt", "gemini", "grok"]);
    expect(catalog().map((m) => m.label)).toEqual(["ChatGPT", "Gemini", "Grok"]);
    expect(PICKER_IDS).toEqual(["chatgpt", "gemini", "grok"]);
  });

  it("requires no paid or fictional model id anywhere in the catalog", () => {
    const serialized = JSON.stringify(catalog());
    expect(serialized).not.toMatch(/gpt-6-luna|gpt-5\.5|grok-4\.7|gemini-2\.5-pro|gpt-6-astra/);
  });

  it("maps picker ids and provider aliases to a provider", () => {
    expect(normalizeModelId("chatgpt")).toBe("chatgpt");
    expect(normalizeModelId("CHATGPT")).toBe("chatgpt");
    expect(normalizeModelId("openai")).toBe("chatgpt");
    expect(normalizeModelId("grok")).toBe("grok");
    expect(normalizeModelId("gemini")).toBe("gemini");
    // Old requests keep routing correctly instead of 500-ing.
    expect(normalizeModelId("grok-4.7")).toBe("grok");
    expect(normalizeModelId("gemini-2.5-flash")).toBe("gemini");
    expect(normalizeModelId("")).toBeUndefined();
    expect(normalizeModelId(null)).toBeUndefined();
  });

  it("infers the provider from any id a client might send", () => {
    expect(inferProvider("chatgpt")).toBe("openai");
    expect(inferProvider("gpt-4o-mini")).toBe("openai");
    expect(inferProvider("gemini-2.5-pro")).toBe("gemini");
    expect(inferProvider("gemma-3-27b-it")).toBe("gemini");
    expect(inferProvider("grok-4.7")).toBe("grok");
    expect(inferProvider("xai")).toBe("grok");
    expect(inferProvider("something-unknown")).toBe("openai");
  });
});