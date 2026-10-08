import { getDb } from "@/db/index";
import { AetherError } from "@/core/errors";

export function rateLimit(key: string, limit: number, windowMs = 60_000): void {
  const db = getDb();
  const now = Date.now();
  const row = db.prepare("SELECT window_start, count FROM rate_buckets WHERE key = ?").get(key) as
    | { window_start: number; count: number }
    | undefined;
  if (!row || now - row.window_start > windowMs) {
    db.prepare(
      "INSERT INTO rate_buckets (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, count=1",
    ).run(key, now);
    return;
  }
  if (row.count >= limit) {
    throw new AetherError("rate_limited", "Rate limit exceeded", 429);
  }
  db.prepare("UPDATE rate_buckets SET count = count + 1 WHERE key = ?").run(key);
}
