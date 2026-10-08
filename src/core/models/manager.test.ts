import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearModelCache } from "./discovery";
import { isAllowedModel, listPublicModels, resolveProvider } from "./manager";
import { AetherError } from "../errors";

const KEYS = [
  "AI_MOCK_MODE",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "OPENAI_MODEL",
  "GEMINI_MODEL",
  "GROK_MODEL",
] as const;

function mockFetch(handler: (url: string) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
}

function list(ids: string[]) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("model manager", () => {
  const snap: Record<string, string | undefined> = {};
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    for (const k of KEYS) snap[k] = process.env[k];
    clearModelCache();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    for (const k of KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    clearModelCache();
  });

  it("uses mock provider when AI_MOCK_MODE is set", async () => {
    process.env.AI_MOCK_MODE = "true";
    const r = await resolveProvider("chatgpt");
    expect(r.mock).toBe(true);
    expect(r.providerId).toBe("mock");
    expect(r.provider.id).toBe("aether-builtin");
    expect(r.model).toBe("aether-engine-v1");
  });

  it("enforces project model allow-lists", () => {
    expect(isAllowedModel("gemini", [])).toBe(true);
    expect(isAllowedModel("gemini", ["gemini"])).toBe(true);
    expect(isAllowedModel("secret-model", ["gemini"])).toBe(false);
    // Legacy alias still matches the picker id on the allow-list.
    expect(isAllowedModel("chatgpt-6-luna", ["chatgpt"])).toBe(true);
  });

  it("matches a pinned env wire id on a project allow-list", () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.GROK_MODEL = "grok-3-mini";
    expect(isAllowedModel("grok", ["grok-3-mini"])).toBe(true);
    expect(isAllowedModel("grok", ["grok-4-fast"])).toBe(false);
  });

  it("does not silently use OpenAI when Gemini is requested without a Gemini key", async () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    await expect(resolveProvider("gemini")).rejects.toThrow(AetherError);
    try {
      await resolveProvider("gemini");
    } catch (e) {
      expect(e).toBeInstanceOf(AetherError);
      expect((e as AetherError).code).toBe("ai_unconfigured");
      expect((e as AetherError).message).toMatch(/GEMINI_API_KEY/);
    }
  });

  it("routes the picker to each provider and sends a free id from that key's live list", async () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gem-test";
    process.env.XAI_API_KEY = "xai-test";
    mockFetch((url) =>
      url.includes("x.ai")
        ? list(["grok-4", "grok-3-mini"])
        : url.includes("googleapis")
          ? new Response(
              JSON.stringify({
                models: [
                  { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
                  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
                ],
              }),
              { status: 200 },
            )
          : list(["gpt-4o", "gpt-4o-mini"]),
    );

    const g = await resolveProvider("gemini");
    expect(g.mock).toBe(false);
    expect(g.providerId).toBe("gemini");
    expect(g.provider.id).toBe("gemini");
    expect(g.model).toBe("gemini-2.5-flash");

    const x = await resolveProvider("grok");
    expect(x.provider.id).toBe("grok");
    expect(x.model).toBe("grok-3-mini");

    const c = await resolveProvider("chatgpt");
    expect(c.provider.id).toBe("openai");
    expect(c.catalogId).toBe("chatgpt");
    expect(c.model).toBe("gpt-4o-mini");
    expect(c.source).toBe("discovery");
  });

  it("does not require gpt-6-luna, gpt-5.5 or grok-4.7 on any path", async () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";
    mockFetch((url) => (url.includes("x.ai") ? list(["grok-3-mini"]) : list(["gpt-4o-mini"])));

    // Legacy names from old clients still resolve — to a free id, not to the old one.
    for (const requested of ["chatgpt", "chatgpt-6-luna", "gpt-5.5", "gpt-6-luna", undefined]) {
      const r = await resolveProvider(requested ?? null);
      expect(r.model).toBe("gpt-4o-mini");
      expect(r.catalogId).toBe("chatgpt");
    }
    const legacyGrok = await resolveProvider("grok-4.7");
    expect(legacyGrok.model).toBe("grok-3-mini");
    expect(legacyGrok.catalogId).toBe("grok");
  });

  it("503s rather than mocking when the key lists no usable model", async () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    mockFetch(() => list([]));
    let caught: AetherError | undefined;
    try {
      await resolveProvider("chatgpt");
    } catch (e) {
      caught = e as AetherError;
    }
    expect(caught).toBeInstanceOf(AetherError);
    expect(caught?.code).toBe("model_unavailable");
    expect(caught?.status).toBe(503);
    expect(caught?.message).toMatch(/OPENAI_MODEL/);
    expect(caught?.message).not.toMatch(/gpt-6-luna|gpt-5\.5|grok-4\.7/);
  });

  it("offers only ChatGPT / Gemini / Grok in the public picker", () => {
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "sk-test";
    mockFetch(() => list(["gpt-4o-mini"]));
    const models = listPublicModels();
    expect(models.map((m) => m.id)).toEqual(["chatgpt", "gemini", "grok"]);
    expect(models.map((m) => m.label)).toEqual(["ChatGPT", "Gemini", "Grok"]);
    expect(models.find((m) => m.id === "chatgpt")?.available).toBe(true);
    expect(models.find((m) => m.id === "grok")?.available).toBe(false);
  });
});