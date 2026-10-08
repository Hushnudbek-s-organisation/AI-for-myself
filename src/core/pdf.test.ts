import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf";

describe("pdf extract", () => {
  it("marks compressed payloads as partial", () => {
    const buf = Buffer.from("%PDF-1.4\n/Filter /FlateDecode\n(Hello world test)\n");
    const r = extractPdfText(buf);
    expect(r.partial).toBe(true);
  });

  it("pulls simple parenthetical text", () => {
    const buf = Buffer.from("%PDF-1.4\nBT (The quick brown fox) Tj ET\n");
    const r = extractPdfText(buf);
    expect(r.text.toLowerCase()).toContain("quick brown fox");
  });
});
