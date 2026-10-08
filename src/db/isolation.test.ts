import { describe, expect, it } from "vitest";

/**
 * Authorization invariant: conversationId is never enough.
 * Owner check is always (conversationId AND authenticated userId).
 * SQLite-backed integration of this lives in conversations.get(id, userId).
 */
function authorizeConversation<T extends { userId: string }>(record: T | undefined, actorId: string): T | undefined {
  if (!record) return undefined;
  if (record.userId !== actorId) return undefined;
  return record;
}

describe("conversation isolation", () => {
  it("does not return another user's conversation by id", () => {
    const conv = { id: "conv_secret", userId: "usr_a", title: "Secret" };
    expect(authorizeConversation(conv, "usr_a")?.title).toBe("Secret");
    expect(authorizeConversation(conv, "usr_b")).toBeUndefined();
  });
});
