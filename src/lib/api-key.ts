import { id, now, rawKey } from "./ids";
import { sha256 } from "./crypto";
import { apiKeys, type ApiKeyRow } from "@/db/repos";
import type { ApiScope } from "@/core/types";
import { parseJson } from "@/db/index";

export function createApiKey(input: {
  projectId: string;
  ownerId: string;
  name: string;
  scopes: ApiScope[];
  rateLimitRpm?: number;
}): { row: ApiKeyRow; plaintext: string } {
  const plaintext = rawKey();
  const row: ApiKeyRow = {
    id: id("key"),
    project_id: input.projectId,
    owner_id: input.ownerId,
    name: input.name,
    key_prefix: plaintext.slice(0, 16),
    key_hash: sha256(plaintext),
    scopes: JSON.stringify(input.scopes),
    rate_limit_rpm: input.rateLimitRpm ?? 60,
    last_used_at: null,
    revoked_at: null,
    created_at: now(),
  };
  apiKeys.create(row);
  return { row, plaintext };
}

export function lookupApiKey(plaintext: string): ApiKeyRow | undefined {
  if (!plaintext.startsWith("aether_sk_")) return undefined;
  const row = apiKeys.byHash(sha256(plaintext));
  if (!row) return undefined;
  apiKeys.touch(row.id);
  return row;
}

export function keyScopes(row: ApiKeyRow): ApiScope[] {
  return parseJson<ApiScope[]>(row.scopes, ["chat"]);
}

export function maskKey(prefix: string): string {
  return `${prefix}…`;
}
