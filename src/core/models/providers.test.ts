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

async function collect(gen: AsyncIterable<{ type: string; text?: string; error?: string; usage?: { provider?: string } }>) {
  const tokens: string[] = [];
  let error: string | undefined;
  let provider: string | undefined;
  for await (const c of gen) {
    if (c.type === "token" && c.text) tokens.push(c.text);
    if (c.type === "error") error = c.error;
    if (c.type === "usage") provider = c.usage?.provider;
  }
  return { text: tokens.join(""), error, provider };
}

describe("gemini / grok adapters", () => {
  const origFetch = globalThis.fetch;
  const snap = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
  };

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (snap.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = snap.GEMINI_API_KEY;
    if (snap.XAI_API_KEY === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = snap.XAI_API_KEY;
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
    expect(out.error).toBeUndefined();
  });

  it("streams Grok Chat Completions SSE", async () => {
    process.env.XAI_API_KEY = "test-xai";
    globalThis.fetch = (async () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"Hello from Grok"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":4}}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      )) as typeof fetch;
    const p = createGrokProvider();
    expect(p).not.toBeNull();
    const out = await collect(p!.generate(gp("grok-4.7")));
    expect(out.text).toBe("Hello from Grok");
    expect(out.provider).toBe("grok");
  });

  it("maps Gemini 401 to a user-safe message", async () => {
    process.env.GEMINI_API_KEY = "bad";
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const p = createGeminiProvider();
    const out = await collect(p!.generate(gp("gemini-2.5-flash")));
    expect(out.error).toMatch(/credentials/i);
    expect(out.error).not.toMatch(/nope/i);
  });
});
