import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearModelCache,
  listProviderModels,
  parseModelList,
  pickFreeModel,
  resolveWireModel,
  resolveWireModelSafe,
  type ModelProblem,
} from "./discovery";
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
  "XAI_MODEL",
  "AI_MODEL_DEFAULT",
] as const;

const snap: Record<string, string | undefined> = {};

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("free-tier model discovery", () => {
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

  describe("selection rule", () => {
    it("prefers cheap/fast ids from the list that actually came back", () => {
      expect(pickFreeModel(["gpt-4o", "gpt-4o-mini", "text-embedding-3-large", "gpt-4.1-nano"])).toBe("gpt-4.1-nano");
      expect(pickFreeModel(["gemini-2.5-pro", "gemini-2.5-flash", "imagen-3.0-generate-002"])).toBe("gemini-2.5-flash");
      expect(pickFreeModel(["grok-4", "grok-3-mini", "grok-2-beta"])).toBe("grok-3-mini");
    });

    it("never picks an embedding, image, audio or gemma id", () => {
      expect(pickFreeModel(["text-embedding-004", "imagen-3.0-generate-002", "veo-2.0-generate-001"])).toBeNull();
      expect(pickFreeModel(["gemma-3-27b-it", "gemini-embedding-001"])).toBeNull();
    });

    it("breaks ties deterministically when nothing marks a cheap tier", () => {
      // "turbo" is a fast tier, so it beats a plain id.
      expect(pickFreeModel(["gpt-4o", "gpt-4-turbo"])).toBe("gpt-4-turbo");
      // Otherwise: shorter id first, then alphabetical — same answer both ways round.
      expect(pickFreeModel(["gpt-4o", "gpt-4"])).toBe("gpt-4");
      expect(pickFreeModel(["gpt-4", "gpt-4o"])).toBe("gpt-4");
      expect(pickFreeModel([])).toBeNull();
    });

    it("penalises paid-tier markers when a cheap id is on the list", () => {
      expect(pickFreeModel(["gemini-2.5-pro", "gemini-2.0-flash"])).toBe("gemini-2.0-flash");
      expect(pickFreeModel(["claude-opus-4", "claude-sonnet-4"])).toBe("claude-sonnet-4");
    });
  });

  describe("listing", () => {
    it("reads GET {OPENAI_BASE_URL}/models with a bearer token", async () => {
      process.env.OPENAI_API_KEY = "sk-free";
      const calls = mockFetch(() => json({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }));
      const r = await listProviderModels("openai");
      expect(calls[0]).toBe("https://api.openai.com/v1/models");
      expect(r.ids).toEqual(["gpt-4o-mini", "gpt-4o"]);
      expect(r.problem).toBeUndefined();
    });

    it("reads GET {GEMINI_BASE_URL}/models with x-goog-api-key and honours supportedGenerationMethods", async () => {
      process.env.GEMINI_API_KEY = "gem-free";
      let header: string | undefined;
      mockFetch((_u, init) => {
        header = (init?.headers as Record<string, string>)?.["x-goog-api-key"];
        return json({
          models: [
            { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
          ],
        });
      });
      const r = await listProviderModels("gemini");
      expect(header).toBe("gem-free");
      expect(r.ids).toEqual(["gemini-2.5-pro", "gemini-2.5-flash"]);
    });

    it("reads GET https://api.x.ai/v1/models", async () => {
      process.env.XAI_API_KEY = "xai-free";
      const calls = mockFetch(() => json({ data: [{ id: "grok-3-mini" }] }));
      const r = await listProviderModels("grok");
      expect(calls[0]).toBe("https://api.x.ai/v1/models");
      expect(r.ids).toEqual(["grok-3-mini"]);
    });

    it("fails soft on a network error instead of throwing", async () => {
      process.env.OPENAI_API_KEY = "sk-free";
      mockFetch(() => {
        throw new Error("ECONNREFUSED");
      });
      const r = await listProviderModels("openai");
      expect(r.ids).toEqual([]);
      expect(r.problem?.kind).toBe("list_failed");
    });

    it("reports a rejected key distinctly from an empty list", async () => {
      process.env.OPENAI_API_KEY = "sk-bad";
      mockFetch(() => json({ error: { message: "Incorrect API key provided" } }, 401));
      const r = await listProviderModels("openai");
      expect(r.problem?.kind).toBe("credentials_rejected");
      expect(r.problem?.message).toMatch(/rejected/i);
    });
  });

  describe("resolution", () => {
    it("uses the cheapest free id the key can list", async () => {
      process.env.OPENAI_API_KEY = "sk-free";
      process.env.AI_MOCK_MODE = "false";
      mockFetch(() => json({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "text-embedding-3-small" }] }));
      const r = await resolveWireModel("openai");
      expect(r.wireModel).toBe("gpt-4o-mini");
      expect(r.source).toBe("discovery");
      expect(r.envVar).toBe("OPENAI_MODEL");
    });

    it("never requires a paid or fictional id — nothing here is gpt-6-luna / gpt-5.5 / grok-4.7", async () => {
      process.env.AI_MOCK_MODE = "false";
      process.env.OPENAI_API_KEY = "sk-free";
      process.env.GEMINI_API_KEY = "gem-free";
      process.env.XAI_API_KEY = "xai-free";
      mockFetch((url) =>
        url.includes("x.ai")
          ? json({ data: [{ id: "grok-3-mini" }] })
          : url.includes("googleapis")
            ? json({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] })
            : json({ data: [{ id: "gpt-4o-mini" }] }),
      );
      const picked = [
        (await resolveWireModel("openai")).wireModel,
        (await resolveWireModel("gemini")).wireModel,
        (await resolveWireModel("grok")).wireModel,
      ];
      expect(picked).toEqual(["gpt-4o-mini", "gemini-2.5-flash", "grok-3-mini"]);
      for (const id of picked) {
        expect(id).not.toMatch(/gpt-6-luna|gpt-5\.5|grok-4\.7|gemini-2\.5-pro/);
      }
    });

    it("lets an optional env override win without calling the provider", async () => {
      process.env.OPENAI_API_KEY = "sk-free";
      process.env.OPENAI_MODEL = "gpt-4.1-mini";
      const calls = mockFetch(() => json({ data: [] }));
      const r = await resolveWireModel("openai");
      expect(r.wireModel).toBe("gpt-4.1-mini");
      expect(r.source).toBe("env");
      expect(calls).toHaveLength(0);
    });

    it("caches the discovery result per key", async () => {
      process.env.XAI_API_KEY = "xai-free";
      const calls = mockFetch(() => json({ data: [{ id: "grok-3-mini" }] }));
      await resolveWireModel("grok");
      await resolveWireModel("grok");
      expect(calls).toHaveLength(1);
    });

    it("503s instead of mocking when the key is fine but no usable model exists", async () => {
      process.env.AI_MOCK_MODE = "false";
      process.env.XAI_API_KEY = "xai-free";
      process.env.OPENAI_API_KEY = "sk-free";
      mockFetch((url) => (url.includes("x.ai") ? json({ data: [] }) : json({ data: [{ id: "gpt-4o-mini" }] })));
      let caught: AetherError | undefined;
      try {
        await resolveWireModel("grok");
      } catch (e) {
        caught = e as AetherError;
      }
      expect(caught).toBeInstanceOf(AetherError);
      expect(caught?.status).toBe(503);
      expect(caught?.code).toBe("model_unavailable");
      expect(caught?.message).toMatch(/GROK_MODEL/);
      expect(caught?.message).toMatch(/free/i);
      expect(caught?.message).not.toMatch(/grok-4\.7/);
    });

    it("503s when every listed model is unusable (no chat models on the account)", async () => {
      process.env.AI_MOCK_MODE = "false";
      process.env.GEMINI_API_KEY = "gem-free";
      mockFetch(() =>
        json({ models: [{ name: "models/gemma-3-27b-it", supportedGenerationMethods: ["generateContent"] }] }),
      );
      const outcome = await resolveWireModelSafe("gemini");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        const problem: ModelProblem = outcome.problem;
        expect(problem.kind).toBe("no_usable_model");
        expect(problem.message).toMatch(/GEMINI_MODEL/);
      }
    });

    it("never silently falls back to mock when discovery fails", async () => {
      process.env.AI_MOCK_MODE = "false";
      process.env.OPENAI_API_KEY = "sk-free";
      mockFetch(() => {
        throw new Error("ETIMEDOUT");
      });
      const outcome = await resolveWireModelSafe("openai");
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.problem.message).toMatch(/OPENAI_MODEL/);
    });
  });

  it("parses both list shapes and ignores junk", () => {
    expect(parseModelList("openai", { data: [{ id: "a" }, { id: "a" }, {}, { id: 5 }] })).toEqual(["a"]);
    expect(parseModelList("grok", { data: [{ id: "grok-3-mini" }] })).toEqual(["grok-3-mini"]);
    expect(parseModelList("gemini", { models: [{ name: "models/gemini-2.5-flash" }] })).toEqual(["gemini-2.5-flash"]);
    expect(parseModelList("openai", null)).toEqual([]);
  });
});