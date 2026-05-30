// Dogfood seed — qa-memory's own behaviors. Neutral data, safe to commit/share.
// Used by the CLI `seed` command and by tests. No-op if any behavior exists.
import type { Database } from "better-sqlite3";
import { countBehaviors, insertBehavior, type NewBehavior } from "./repo/behaviors.js";
import { insertRule } from "./repo/rules.js";

const SEED: NewBehavior[] = [
  {
    name: "Schema migrations apply in order",
    description:
      "Pending migrations run in version order inside a transaction; the runner is idempotent across restarts.",
    criticality: "P0",
    confirmed_by_qa: true,
  },
  {
    name: "Sensitive data never reaches git",
    description:
      "Repo stays neutral: no company names, internal URLs, real project keys, or credentials. The real instance lives in the git-ignored .qa-memory/ dir.",
    criticality: "P0",
    confirmed_by_qa: true,
  },
  {
    name: "Every LLM call logs token usage",
    description: "Input + output tokens are recorded for each model call during ingestion.",
    criticality: "P1",
  },
];

// Returns number of behaviors inserted (0 if DB already had behaviors).
export function seedDb(db: Database): number {
  if (countBehaviors(db) > 0) return 0;
  let tokenBehaviorId: string | null = null;
  for (const b of SEED) {
    const id = insertBehavior(db, b);
    if (b.name === "Every LLM call logs token usage") tokenBehaviorId = id;
  }
  // One QA-confirmed rule so query_risk has rule context to show out of the box.
  if (tokenBehaviorId) {
    insertRule(db, {
      behavior_id: tokenBehaviorId,
      rule_text: "Token counts (input + output) are emitted for every model call; a call with no token log is a defect.",
      confidence: 1.0,
      qa_override: true,
      override_reason: "Non-negotiable project rule (CLAUDE.md).",
    });
  }
  return SEED.length;
}
