import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export function id(prefix: string): string {
  return `${prefix}_${nano()}`;
}

export function rawKey(): string {
  const nanoKey = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    32,
  );
  return `aether_sk_${nanoKey()}`;
}

export function now(): number {
  return Date.now();
}
