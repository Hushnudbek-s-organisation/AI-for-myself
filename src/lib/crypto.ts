import { createHash, randomBytes } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
