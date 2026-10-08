import type { Conversation } from "@/core/types";

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupConversations(list: Conversation[]): Array<{ label: string; items: Conversation[] }> {
  const now = Date.now();
  const today = startOfDay(now);
  const yesterday = today - 86400000;
  const week = today - 7 * 86400000;
  const month = today - 30 * 86400000;
  const buckets: Record<string, Conversation[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };
  for (const c of list) {
    if (c.pinned) {
      buckets.Pinned.push(c);
      continue;
    }
    const t = startOfDay(c.updatedAt);
    if (t >= today) buckets.Today.push(c);
    else if (t >= yesterday) buckets.Yesterday.push(c);
    else if (t >= week) buckets["Previous 7 days"].push(c);
    else if (t >= month) buckets["Previous 30 days"].push(c);
    else buckets.Older.push(c);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}
