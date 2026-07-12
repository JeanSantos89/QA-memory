// DB open helper. Enables foreign keys + WAL; runs pending migrations.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrations.js";

export type { Migration } from "./migrations.js";
export { migrate, MIGRATIONS } from "./migrations.js";

// path ":memory:" → ephemeral DB (tests). Otherwise file path (parent dir created).
export function openDb(path: string): Database.Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  // Explicit lock wait: the MCP server and the Python pipeline can hit the same
  // file-backed DB concurrently. better-sqlite3 defaults to 5000ms already —
  // pinned here so the contract is intentional and mirrored in Python connect().
  db.pragma("busy_timeout = 5000");
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}
