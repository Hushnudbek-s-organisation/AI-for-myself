import { describe, expect, it } from "vitest";
import { AetherError } from "../errors";
import {
  httpStatusError,
  providerFailureMessage,
  userSafeFailureMessage,
  userSafeProviderError,
} from "./shared";

describe("provider failure messages", () => {
  it("gives HTTP 4xx rejections a provider-specific model and key action", () => {
    expect(providerFailureMessage("openai", "rejected", 400)).toBe(
      "ChatGPT rejected the request (HTTP 400). Check that OPENAI_MODEL is a model id this account can actually call and that the key is valid. Aether will not switch model or fall back to mock.",
    );
  });

  it("gives HTTP 5xx outages a provider-specific recovery action", () => {
    expect(providerFailureMessage("openai", "unavailable", 500)).toBe(
      "ChatGPT could not be reached (HTTP 500). This is usually a provider outage, a network block, or an over-long prompt — retry shortly. If it keeps happening, check that the ChatGPT key and OPENAI_MODEL match your free-tier account. Aether never falls back to mock.",
    );
  });

  it("uses the selected provider's label and model env var", () => {
    for (const [provider, label, envVar] of [
      ["gemini", "Gemini", "GEMINI_MODEL"],
      ["grok", "Grok", "GROK_MODEL"],
    ] as const) {
      const rejected = providerFailureMessage(provider, "rejected", 400);
      const unavailable = providerFailureMessage(provider, "unavailable", 503);
      expect(rejected).toContain(`${label} rejected the request`);
      expect(rejected).toContain(envVar);
      expect(unavailable).toContain(`${label} could not be reached`);
      expect(unavailable).toContain(envVar);
    }
  });

  it("classifies SDK 4xx, 5xx, and network errors without echoing provider details", () => {
    const rejected = userSafeProviderError(
      Object.assign(new Error("private provider text api_key=secret-value"), { status: 400 }),
      "openai",
    );
    const unavailable = userSafeProviderError(
      Object.assign(new Error("private provider text api_key=secret-value"), { status: 500 }),
      "openai",
    );
    const network = userSafeProviderError(new Error("fetch failed: ECONNRESET"), "openai");

    expect(rejected).toContain("ChatGPT rejected the request (HTTP 400)");
    expect(unavailable).toContain("ChatGPT could not be reached (HTTP 500)");
    expect(network).toContain("ChatGPT could not be reached");
    for (const message of [rejected, unavailable, network]) {
      expect(message).not.toMatch(/private provider text|secret-value|api_key/i);
      expect(message).toContain("OPENAI_MODEL");
    }
  });

  it("classifies raw HTTP statuses and never includes their response body", () => {
    const rejected = httpStatusError(400, '{"message":"private response api_key=secret-value"}', "gemini");
    const unavailable = httpStatusError(500, "private provider response", "grok");

    expect(rejected).toContain("Gemini rejected the request (HTTP 400)");
    expect(rejected).toContain("GEMINI_MODEL");
    expect(unavailable).toContain("Grok could not be reached (HTTP 500)");
    expect(unavailable).toContain("GROK_MODEL");
    expect(`${rejected} ${unavailable}`).not.toMatch(/private response|secret-value|api_key/i);
  });

  it("turns both spaced and deadline-based timeout errors into an actionable instruction", () => {
    for (const error of [new Error("request timed out"), new Error("deadline exceeded")]) {
      const message = userSafeProviderError(error, "gemini");
      expect(message).toMatch(/Gemini timed out/i);
      expect(message).toContain("Shorten the message");
      expect(message).toContain("AI_TIMEOUT_MS");
    }
  });

  it("names the provider for credential and rate-limit rejections", () => {
    expect(httpStatusError(401, "unauthorized", "openai")).toMatch(/ChatGPT rejected the configured credentials.*HTTP 401/);
    expect(httpStatusError(403, "forbidden", "gemini")).toMatch(/Gemini rejected the configured credentials.*HTTP 403/);
    expect(httpStatusError(429, "rate limited", "grok")).toMatch(/Grok rejected the request.*HTTP 429/);
  });

  it("preserves public platform errors and sanitizes unexpected exceptions", () => {
    const publicError = new AetherError("model_unavailable", "Set OPENAI_MODEL to a usable id.", 503);
    expect(userSafeFailureMessage(publicError, "openai")).toBe("Set OPENAI_MODEL to a usable id.");

    const unknown = new Error("internal stack detail api_key=secret-value");
    const safe = userSafeFailureMessage(unknown, "grok");
    expect(safe).toContain("Grok could not be reached");
    expect(safe).toContain("GROK_MODEL");
    expect(safe).not.toMatch(/internal stack detail|secret-value|api_key/i);
  });
});
