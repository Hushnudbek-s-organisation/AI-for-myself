import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "aether.db");

let singleton: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (singleton) return singleton;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  singleton = db;
  return db;
}

export function row<T>(stmt: string, params: unknown[] = []): T | undefined {
  const r = getDb().prepare(stmt).get(...(params as never[])) as T | undefined;
  return r;
}

export function rows<T>(stmt: string, params: unknown[] = []): T[] {
  return getDb().prepare(stmt).all(...(params as never[])) as T[];
}

export function run(stmt: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const result = getDb().prepare(stmt).run(...(params as never[]));
  return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
}

export function json<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
