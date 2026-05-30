// Runtime config. DB path resolution only (Fase 2).
// Default DB lives in the git-ignored instance dir `.qa-memory/`.
import { resolve } from "node:path";

export const DEFAULT_DB_PATH = ".qa-memory/qa-memory.db";

// Env override → QA_MEMORY_DB. Absolute or relative to cwd.
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.QA_MEMORY_DB?.trim();
  if (raw) return resolve(raw);
  return resolve(DEFAULT_DB_PATH);
}
