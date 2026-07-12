// Cross-language query translation bridge. The semantic embedder (all-MiniLM)
// is English-centric: a PT query against EN-stored behaviors returns cosine < floor
// (proven live, STATE/ADR 027). analyze_impact already fixes this in Python via
// crosslang.py. This module extends the fix to query_behavior and query_risk
// (the synchronous TS search path) by trying the translated query as a fallback
// when the original returns 0 results.
//
// The translation subprocess is only called when the first pass returns nothing —
// so happy-path queries (matching language) pay zero extra latency. The interface
// is injectable → tests use a fake without spawning Python.
import { spawnSync } from "node:child_process";

export interface TranslateResult {
  translation: string | null;
  note: string | null;
}

export interface Translator {
  translate(text: string): TranslateResult;
}

// Resolves the `translate` subcommand (mirrors assessCommand in assessor.ts).
// Override via QA_MEMORY_TRANSLATE_CMD if uv is not on PATH.
function translateCommand(env: NodeJS.ProcessEnv): string[] {
  const raw = env.QA_MEMORY_TRANSLATE_CMD?.trim();
  if (raw) return raw.split(/\s+/);
  return ["uv", "run", "qa-memory", "translate"];
}

function defaultCwd(env: NodeJS.ProcessEnv): string | undefined {
  return env.QA_MEMORY_INGESTION_DIR?.trim() || undefined;
}

// Subprocess budget (ms) for the translate CLI. Override via
// QA_MEMORY_TRANSLATE_TIMEOUT_MS (mirrors the *_CMD pattern).
function translateTimeoutMs(env: NodeJS.ProcessEnv): number {
  const v = parseInt(env.QA_MEMORY_TRANSLATE_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : 60_000;
}

export class PythonTranslator implements Translator {
  private readonly cwd?: string;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    cwd?: string,
  ) {
    this.cwd = cwd ?? defaultCwd(env);
  }

  translate(text: string): TranslateResult {
    const [cmd, ...args] = translateCommand(this.env);
    if (!cmd) return { translation: null, note: "no translate command configured" };
    const res = spawnSync(cmd, [...args, "-"], {
      input: text,
      cwd: this.cwd,
      encoding: "utf8",
      timeout: translateTimeoutMs(this.env),
    });
    if (res.status !== 0) return { translation: null, note: null };
    try {
      const data = JSON.parse((res.stdout ?? "{}").trim()) as {
        translation?: string | null;
        note?: string | null;
      };
      return {
        translation: data.translation ?? null,
        note: data.note ?? null,
      };
    } catch {
      return { translation: null, note: null };
    }
  }
}
