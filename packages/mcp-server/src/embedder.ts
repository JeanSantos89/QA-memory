// Query-time embedding. The model lives in the Python package (sentence-
// transformers); we shell out to its `embed` CLI so query vectors land in the
// exact same space as the stored ones. Injected behind an interface → tests
// use a fake, no torch/model download (mirrors the Python EmbeddingModel Protocol).
import { spawnSync } from "node:child_process";

export interface Embedder {
  // Returns the embedding vector, or null if embedding is unavailable
  // (subprocess missing/failed) so callers can fall back to LIKE.
  embed(text: string): number[] | null;
}

// Default command: `uv run --project <ingestion> qa-memory embed`.
// Override the whole prefix via QA_MEMORY_EMBED_CMD (space-separated) for
// environments where uv is not on PATH (documented runtime gotcha).
function embedCommand(env: NodeJS.ProcessEnv): string[] {
  const raw = env.QA_MEMORY_EMBED_CMD?.trim();
  if (raw) return raw.split(/\s+/);
  return ["uv", "run", "qa-memory", "embed"];
}

export class PythonEmbedder implements Embedder {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly cwd?: string,
  ) {}

  embed(text: string): number[] | null {
    const [cmd, ...args] = embedCommand(this.env);
    if (!cmd) return null;
    const res = spawnSync(cmd, [...args, text], {
      cwd: this.cwd,
      encoding: "utf8",
      // Model load + encode can take a few seconds on a cold process.
      timeout: 60_000,
    });
    if (res.status !== 0 || !res.stdout) return null;
    try {
      const parsed = JSON.parse(res.stdout.trim()) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "number")) {
        return parsed as number[];
      }
      return null;
    } catch {
      return null;
    }
  }
}
