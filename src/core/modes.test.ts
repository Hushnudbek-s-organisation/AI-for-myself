import { describe, expect, it } from "vitest";
import { getMode, listModes } from "./modes";
import { MODE_IDS } from "./types";

describe("modes", () => {
  it("registers every mode id", () => {
    const ids = listModes().map((m) => m.id);
    for (const id of MODE_IDS) expect(ids).toContain(id);
  });

  it("falls back to general", () => {
    expect(getMode("nope").id).toBe("general");
  });

  it("university mode forbids invention via instructions", () => {
    expect(getMode("university").instructions).toMatch(/NEVER invent tuition/i);
  });

  it("visa mode forbids deception", () => {
    expect(getMode("visa").instructions).toMatch(/NEVER teach deception/i);
  });

  it("admission mode forbids probability invention", () => {
    expect(getMode("admission").instructions).toMatch(/MUST NOT calculate or invent/i);
  });
});
