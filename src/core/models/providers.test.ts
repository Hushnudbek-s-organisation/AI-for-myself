import { afterEach, describe, expect, it } from "vitest";
import type { GenerateParams } from "../types";
import { createGeminiProvider, geminiContents, geminiDeltaText } from "./gemini";
import { createGrokProvider, grokDeltaText } from "./grok";
import { parseSseDataLine } from "./shared";

function gp(model: string): GenerateParams {
  return {
    assembled: {
      layers: [],
      systemText: "You are Aether.",
      messages: [{ role: "user", content: "Hello" }],
      visibleToUser: {
        mode: "general",
        customInstructions: false,
        tools: [],
        files: [],
        model,
      },
    },
    mode: { id: "general" } as GenerateParams["mode"],
    toolsAllowed: [],
    model,
    tier: "balanced",
    attachments: [],
  };
}

async function collect(gen: AsyncIterable<{ type: string; text?: string; error?: string; usage?: { provider?: string; model?: string } }>) {
  const tokens: string[] = [];
  let error: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  for await (const c of gen) {
    if (c.type === "token" && c.text) tokens.push(c.text);
    if (c.type === "error") error = c.error;
    if (c.type === "usage") {
      provider = c.usage?.provider;
      model = c.usage?.model;
    }
  }
  return { text: tokens.join(""), error, provider, model };
}

describe("gemini / grok adapters", () => {
  const origFetch = globalThis.fetch;
  const snap = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
  };

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (snap.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = snap.GEMINI_API_KEY;
    if (snap.XAI_API_KEY === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = snap.XAI_API_KEY;
    if (snap.AI_MAX_RETRIES === undefined) delete process.env.AI_MAX_RETRIES;
    else process.env.AI_MAX_RETRIES = snap.AI_MAX_RETRIES;
  });

  it("merges consecutive Gemini roles and extracts deltas", () => {
    const contents = geminiContents([
      { role: "assistant", content: "prior" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(contents[0].role).toBe("user");
    expect(contents.some((c) => c.role === "user" && c.parts[0].text.includes("a\nb"))).toBe(true);
    expect(geminiDeltaText({ candidates: [{ content: { parts: [{ text: "Hi" }] } }] })).toBe("Hi");
  });

  it("parses OpenAI-compatible SSE lines for Grok", () => {
    expect(parseSseDataLine("data: {\"choices\":[{\"delta\":{\"content\":\"Yo\"}}]}")).toEqual({
      choices: [{ delta: { content: "Yo" } }],
    });
    expect(grokDeltaText({ choices: [{ delta: { content: "Yo" } }] })).toBe("Yo");
    expect(parseSseDataLine("data: [DONE]")).toBeUndefined();
  });

  it("streams Gemini SSE without leaking errors", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    globalThis.fetch = (async () =>
      new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]}}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":4}}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;
    const p = createGeminiProvider();
    expect(p).not.toBeNull();
    const out = await collect(p!.generate(gp("gemini-2.5-flash")));
    expect(out.text).toBe("Hello from Gemini");
    expect(out.provider).toBe("gemini");
    expect(out.model).toBe("gemini-2.5-flash");
    expect(out.error).toBeUndefined();
  });

  it("streams Grok Chat Completions SSE with the resolved free id", async () => {
    process.env.XAI_API_KEY = "test-xai";
    let sentBody = "";
    globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return new Response(
        'data: {"choices":[{"delta":{"content":"Hello from Grok"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":4}}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;
    const p = createGrokProvider();
    const out = await collect(p!.generate(gp("grok-3-mini")));
    expect(out.text).toBe("Hello from Grok");
    expect(out.provider).toBe("grok");
    expect(JSON.parse(sentBody).model).toBe("grok-3-mini");
  });

  it("maps Gemini 401 to a user-safe message", async () => {
    process.env.GEMINI_API_KEY = "bad";
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const p = createGeminiProvider();
    const out = await collect(p!.generate(gp("gemini-2.5-flash")));
    expect(out.error).toMatch(/credentials/i);
    expect(out.error).not.toMatch(/nope/i);
  });

  it("surfaces a Gemini model_not_found as an actionable env-var message, never a mock reply", async () => {
    process.env.GEMINI_API_KEY = "free-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 404, message: "models/gpt-6-luna is not found for API key" } }), {
        status: 404,
      })) as typeof fetch;
    const p = createGeminiProvider();
    const out = await collect(p!.generate(gp("some-paid-id")));
    expect(out.error).toMatch(/GEMINI_MODEL/);
    expect(out.error).toMatch(/free tier/i);
    expect(out.text).toBe("");
    expect(out.provider).toBeUndefined();
  });

  it("surfaces an xAI billing 403 as the same actionable message", async () => {
    process.env.XAI_API_KEY = "free-key";
    process.env.AI_MAX_RETRIES = "0";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "Your team does not have access to this model. Add credits." } }), {
        status: 403,
      });
    }) as typeof fetch;
    const p = createGrokProvider();
    const out = await collect(p!.generate(gp("grok-4-fast")));
    expect(out.error).toMatch(/GROK_MODEL/);
    expect(out.error).not.toMatch(/credits|401|403/);
    expect(calls).toBe(1);
  });

  it("maps mid-stream Gemini and Grok error frames without leaking their bodies", async () => {
    process.env.GEMINI_API_KEY = "free-gemini";
    process.env.XAI_API_KEY = "free-xai";
    process.env.AI_MAX_RETRIES = "0";

    globalThis.fetch = (async () =>
      new Response('data: {"error":{"code":400,"message":"private Gemini api_key=secret-value"}}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;
    const gemini = await collect(createGeminiProvider()!.generate(gp("gemini-2.5-flash")));
    expect(gemini.error).toContain("Gemini rejected the request (HTTP 400)");
    expect(gemini.error).toContain("GEMINI_MODEL");
    expect(gemini.text).toBe("");
    expect(gemini.error).not.toMatch(/private Gemini|secret-value|api_key/i);

    globalThis.fetch = (async () =>
      new Response('data: {"error":{"status":500,"message":"private Grok api_key=secret-value"}}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })) as typeof fetch;
    const grok = await collect(createGrokProvider()!.generate(gp("grok-3-mini")));
    expect(grok.error).toContain("Grok could not be reached (HTTP 500)");
    expect(grok.error).toContain("GROK_MODEL");
    expect(grok.text).toBe("");
    expect(grok.error).not.toMatch(/private Grok|secret-value|api_key/i);
  });

  it("never invents a default wire id when the router supplies none", async () => {
    process.env.XAI_API_KEY = "free-key";
    globalThis.fetch = (async () => new Response("should not be called", { status: 200 })) as typeof fetch;
    const p = createGrokProvider();
    await expect(collect(p!.generate(gp("")))).rejects.toThrow(/GROK_MODEL/);
  });
});