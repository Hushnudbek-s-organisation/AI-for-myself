import { redactSecrets } from "./security";

const SENSITIVE = /password|secret|token|authorization|api[_-]?key|cookie|session/i;

export function requestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitize(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string") out[k] = redactSecrets(v).slice(0, 500);
    else out[k] = v;
  }
  return out;
}

export function log(
  level: "info" | "warn" | "error",
  message: string,
  meta: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...sanitize(meta),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
