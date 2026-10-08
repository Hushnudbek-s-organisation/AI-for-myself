import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerate, mockAuthFromRequest } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockAuthFromRequest: vi.fn(),
}));

vi.mock("@/lib/request-auth", () => ({
  authFromRequest: (...args: unknown[]) => mockAuthFromRequest(...args),
  requireScope: vi.fn(),
}));

vi.mock("./models/openai", () => ({
  createOpenAIProvider: () => ({
    id: "openai",
    name: "ChatGPT",
    tiers: ["fast", "balanced", "reasoning"],
    generate: (...args: unknown[]) => mockGenerate(...args),
  }),
}));

vi.mock("@/db/seed", () => ({ ensureSeeded: vi.fn() }));
vi.mock("@/db/index", () => ({
  getDb: vi.fn(() => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })) })),
  })),
  row: vi.fn(),
  rows: vi.fn(() => []),
  run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
  json: vi.fn((value: unknown) => (value === undefined ? null : JSON.stringify(value))),
  parseJson: (_raw: unknown, fallback: unknown) => fallback,
}));
vi.mock("@/db/repos", () => ({
  conversations: {
    create: () => ({
      id: "conv_provider_error_test",
      userId: "usr_provider_error_test",
      title: "New Chat",
      mode: "general",
      skillId: null,
      skillVersion: null,
      model: "chatgpt",
      pinned: false,
      archived: false,
      folderId: null,
      lastMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    get: vi.fn(),
    update: vi.fn(),
  },
  files: { get: vi.fn() },
  instructions: { asText: vi.fn(() => null) },
  messages: {
    create: vi.fn(() => ({ id: "msg_provider_error_test", createdAt: Date.now() })),
    list: vi.fn(() => []),
    get: vi.fn(),
    deleteAfter: vi.fn(),
  },
  projects: { get: vi.fn() },
  rules: { enabledText: vi.fn(() => "") },
  skills: { get: vi.fn() },
  usage: { write: vi.fn() },
}));

import { NextRequest } from "next/server";
import { POST as chatPost } from "@/app/api/v1/chat/route";
import { POST as streamPost } from "@/app/api/v1/chat/stream/route";

describe("chat endpoint provider failures", () => {
  const envKeys = ["AI_MOCK_MODE", "OPENAI_API_KEY", "OPENAI_MODEL"] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) savedEnv[key] = process.env[key];
    process.env.AI_MOCK_MODE = "false";
    process.env.OPENAI_API_KEY = "test-provider-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    mockGenerate.mockReset();
    mockAuthFromRequest.mockReset();
    mockAuthFromRequest.mockResolvedValue({
      kind: "session",
      userId: "usr_provider_error_test",
      role: "admin",
      scopes: ["chat", "stream"],
    });
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("returns an actionable rejection from POST /v1/chat", async () => {
    mockGenerate.mockImplementation(() =>
      (async function* () {
        throw Object.assign(new Error("private upstream body api_key=secret-value"), { status: 400 });
      })(),
    );
    const req = new NextRequest("http://localhost/api/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello", model: "chatgpt" }),
    });

    const response = await chatPost(req);
    const payload = (await response.json()) as { error: { message: string } };
    expect(response.status).toBe(502);
    expect(payload.error.message).toContain("ChatGPT rejected the request (HTTP 400)");
    expect(payload.error.message).toContain("OPENAI_MODEL");
    expect(payload.error.message).not.toMatch(/private upstream body|secret-value|api_key/i);
  });

  it("returns an actionable provider outage from POST /v1/chat/stream", async () => {
    mockGenerate.mockImplementation(() =>
      (async function* () {
        throw Object.assign(new Error("private upstream body api_key=secret-value"), { status: 500 });
      })(),
    );
    const req = new NextRequest("http://localhost/api/v1/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello", model: "chatgpt" }),
    });

    const response = await streamPost(req);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("ChatGPT could not be reached (HTTP 500)");
    expect(body).toContain("OPENAI_MODEL");
    expect(body).not.toMatch(/private upstream body|secret-value|api_key/i);
  });
});
