import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateParams } from "../types";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

// The real SDK is replaced so we can assert the exact wire call without a network.
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor(public options: unknown) {}
    responses = { create: createMock };
  },
}));

import { createOpenAIProvider } from "./openai";

function gp(model: string): GenerateParams {
  return {
    assembled: {
      layers: [],
      systemText: "You are Aether.",
      messages: [{ role: "user", content: "Hello" }],
      visibleToUser: { mode: "general", customInstructions: false, tools: [], files: [], model },
    },
    mode: { id: "general" } as GenerateParams["mode"],
    toolsAllowed: [],
    model,
    tier: "balanced",
    attachments: [],
  };
}

async function collect(gen: AsyncIterable<{ type: string; text?: string; error?: string }>) {
  const tokens: string[] = [];
  let error: string | undefined;
  for await (const c of gen) {
    if (c.type === "token" && c.text) tokens.push(c.text);
    if (c.type === "error") error = c.error;
  }
  return { text: tokens.join(""), error };
}

async function* sse(events: unknown[]) {
  for (const e of events) yield e;
}

describe("openai provider", () => {
  const snap: Record<string, string | undefined> = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
  };

  beforeEach(() => {
    createMock.mockReset();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses the current Responses API with store:false and the resolved free id", async () => {
    process.env.OPENAI_API_KEY = "sk-free";
    createMock.mockResolvedValue(
      sse([
        { type: "response.output_text.delta", delta: "Hi" },
        { type: "response.completed", response: { usage: { input_tokens: 3, output_tokens: 4 } } },
      ]),
    );
    const p = createOpenAIProvider();
    const out = await collect(p!.generate(gp("gpt-4o-mini")));
    expect(out.text).toBe("Hi");
    const [body] = createMock.mock.calls[0];
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.instructions).toBe("You are Aether.");
    // Application-owned conversation state: no provider-side storage.
    expect(JSON.stringify(body)).not.toMatch(/previous_response_id|conversation/i);
  });

  it("turns model_not_found into an actionable message and never falls back", async () => {
    process.env.OPENAI_API_KEY = "sk-free";
    process.env.AI_MAX_RETRIES = "0";
    createMock.mockRejectedValue(
      Object.assign(new Error("404 model_not_found"), {
        status: 404,
        error: { code: "model_not_found", message: "The model `gpt-6-luna` does not exist" },
      }),
    );
    const p = createOpenAIProvider();
    const out = await collect(p!.generate(gp("gpt-6-luna")));
    expect(out.error).toMatch(/OPENAI_MODEL/);
    expect(out.error).toMatch(/free tier/i);
    expect(out.text).toBe("");
  });

  it("turns a billing 429 into the same message without retrying", async () => {
    process.env.OPENAI_API_KEY = "sk-free";
    process.env.AI_MAX_RETRIES = "2";
    createMock.mockRejectedValue(
      Object.assign(new Error("429 insufficient_quota"), {
        status: 429,
        code: "insufficient_quota",
        message: "You exceeded your current quota, please check your plan and billing details.",
      }),
    );
    const p = createOpenAIProvider();
    const out = await collect(p!.generate(gp("gpt-4o")));
    expect(out.error).toMatch(/OPENAI_MODEL/);
    expect(out.error).not.toMatch(/quota|billing/i);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("maps provider error frames and failed responses to actionable messages", async () => {
    process.env.OPENAI_API_KEY = "sk-free";
    process.env.AI_MAX_RETRIES = "0";
    const p = createOpenAIProvider();

    createMock.mockResolvedValue(
      sse([
        {
          type: "error",
          status: 400,
          error: { message: "private provider response api_key=secret-value" },
        },
      ]),
    );
    const rejected = await collect(p!.generate(gp("gpt-4o-mini")));
    expect(rejected.error).toContain("ChatGPT rejected the request (HTTP 400)");
    expect(rejected.error).toContain("OPENAI_MODEL");
    expect(rejected.error).not.toMatch(/private provider response|secret-value|api_key/i);

    createMock.mockResolvedValue(
      sse([
        {
          type: "response.failed",
          response: {
            error: { status: 500, message: "private upstream failure api_key=secret-value" },
          },
        },
      ]),
    );
    const unavailable = await collect(p!.generate(gp("gpt-4o-mini")));
    expect(unavailable.error).toContain("ChatGPT could not be reached (HTTP 500)");
    expect(unavailable.error).toContain("OPENAI_MODEL");
    expect(unavailable.error).not.toMatch(/private upstream failure|secret-value|api_key/i);
  });

  it("refuses to invent a wire id when the router supplied none", async () => {
    process.env.OPENAI_API_KEY = "sk-free";
    const p = createOpenAIProvider();
    await expect(collect(p!.generate(gp("")))).rejects.toThrow(/OPENAI_MODEL/);
    expect(createMock).not.toHaveBeenCalled();
  });
});