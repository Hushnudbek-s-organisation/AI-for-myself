import { describe, expect, it } from "vitest";
import { isAllowedModel, resolveProvider } from "./manager";

describe("model manager", () => {
  it("uses mock provider when AI_MOCK_MODE is set", () => {
    const r = resolveProvider("anything");
    expect(r.mock).toBe(true);
    expect(r.provider.id).toBe("aether-builtin");
  });

  it("enforces project model allow-lists", () => {
    expect(isAllowedModel("gpt-5.5", [])).toBe(true);
    expect(isAllowedModel("gpt-5.5", ["gpt-5.5"])).toBe(true);
    expect(isAllowedModel("secret-model", ["gpt-5.5"])).toBe(false);
  });
});
