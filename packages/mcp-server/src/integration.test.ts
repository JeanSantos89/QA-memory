// Real TS ↔ Python integration: everything else in the suite fakes the
// embedder; this file spawns the actual `uv run qa-memory embed-serve`
// subprocess with the real sentence-transformers model, so the cross-language
// contract (spawn args, line protocol, float32 space) is exercised end-to-end.
// Opt-in only (QA_MEMORY_IT=1 — the CI integration job, or local runs): the
// cold model load takes ~20s+ and needs uv + the ingestion package installed.
// The assess/translate paths still need an LLM key and stay manual-only.
import { afterAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { openDb } from "./db/index.js";
import { PersistentEmbedder } from "./embedder.js";
import { feedKnowledge } from "./feed.js";
import { searchBehaviors } from "./search.js";

const enabled = process.env.QA_MEMORY_IT === "1";
const ingestionDir =
  process.env.QA_MEMORY_INGESTION_DIR ?? resolve(process.cwd(), "../ingestion");
const TIMEOUT = 300_000; // first call downloads/loads the model in CI

describe.runIf(enabled)("real Python embedder (QA_MEMORY_IT=1)", () => {
  const embedder = new PersistentEmbedder({
    ...process.env,
    QA_MEMORY_INGESTION_DIR: ingestionDir,
  });
  afterAll(() => embedder.close());

  it(
    "embeds via the real model: 384-dim finite vector",
    async () => {
      const vec = await embedder.embed("checkout payment flow");
      expect(vec).not.toBeNull();
      expect(vec!.length).toBe(384);
      expect(vec!.every(Number.isFinite)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "feed → semantic search end-to-end with real vectors",
    async () => {
      const db = openDb(":memory:");
      await feedKnowledge(
        db,
        {
          behaviors: [
            {
              name: "Order cancellation",
              description: "Customer cancels an order after acceptance",
              criticality: "P1",
            },
            {
              name: "Report export",
              description: "Analyst exports dashboard data to CSV",
              criticality: "P2",
            },
          ],
        },
        embedder,
      );
      // No LIKE overlap with either behavior — only the semantic path can rank this.
      const results = await searchBehaviors(db, embedder, "cancel my purchase");
      expect(results[0]?.name).toBe("Order cancellation");
    },
    TIMEOUT,
  );
});
