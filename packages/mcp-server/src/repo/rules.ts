// Rules data access. Rules belong to behaviors; confidence drives visibility.
// SCHEMA: rules with confidence < 0.5 are under_review → not returned until confirmed.
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

// Rules below this confidence are under_review (hidden from MCP consumers).
export const UNDER_REVIEW_BELOW = 0.5;

export interface Rule {
  id: string;
  behavior_id: string;
  rule_text: string;
  confidence: number;
  source_excerpt: string | null;
  source_id: string | null;
  qa_override: boolean;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface RuleRow {
  id: string;
  behavior_id: string;
  rule_text: string;
  confidence: number;
  source_excerpt: string | null;
  source_id: string | null;
  qa_override: number;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: RuleRow): Rule {
  return {
    id: row.id,
    behavior_id: row.behavior_id,
    rule_text: row.rule_text,
    confidence: row.confidence,
    source_excerpt: row.source_excerpt,
    source_id: row.source_id,
    qa_override: row.qa_override === 1,
    override_reason: row.override_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface NewRule {
  behavior_id: string;
  rule_text: string;
  confidence?: number;
  source_excerpt?: string | null;
  source_id?: string | null;
  qa_override?: boolean;
  override_reason?: string | null;
}

// Inserts a rule, returns its id. Used by seeding + tests.
export function insertRule(
  db: Database,
  r: NewRule,
  now: string = new Date().toISOString(),
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO rules
       (id, behavior_id, rule_text, confidence, source_excerpt, source_id,
        qa_override, override_reason, created_at, updated_at)
     VALUES (@id, @behavior_id, @rule_text, @confidence, @source_excerpt, @source_id,
             @qa_override, @override_reason, @created_at, @updated_at)`,
  ).run({
    id,
    behavior_id: r.behavior_id,
    rule_text: r.rule_text,
    confidence: r.confidence ?? 0.7,
    source_excerpt: r.source_excerpt ?? null,
    source_id: r.source_id ?? null,
    qa_override: r.qa_override ? 1 : 0,
    override_reason: r.override_reason ?? null,
    created_at: now,
    updated_at: now,
  });
  return id;
}

// Returns visible rules (confidence >= 0.5) for the given behaviors.
// QA overrides first, then higher confidence. Empty input → empty result.
export function listRulesForBehaviors(
  db: Database,
  behaviorIds: string[],
): Rule[] {
  if (behaviorIds.length === 0) return [];
  const placeholders = behaviorIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM rules
       WHERE behavior_id IN (${placeholders}) AND confidence >= ?
       ORDER BY qa_override DESC, confidence DESC, created_at DESC`,
    )
    .all(...behaviorIds, UNDER_REVIEW_BELOW) as RuleRow[];
  return rows.map(hydrate);
}

// A rule awaiting QA confirmation, paired with its behavior's context so the
// reviewer (memory-keeper) can judge it without a second lookup.
export interface PendingRule {
  rule: Rule;
  behavior_name: string;
  behavior_criticality: string;
  under_review: boolean; // confidence < UNDER_REVIEW_BELOW (hidden from normal MCP reads)
}

// Rules the QA never confirmed (qa_override = 0) — the promotion queue the
// memory-keeper curates. INCLUDES under_review rules (confidence < 0.5), which
// are invisible to every other MCP read: this is the one surface that can
// rescue or discard a weak inference. Excludes deprecated behaviors. Weakest
// confidence first (most in need of a human call), then oldest.
export function listUnconfirmedRules(db: Database): PendingRule[] {
  const rows = db
    .prepare(
      `SELECT r.*, b.name AS behavior_name, b.criticality AS behavior_criticality
         FROM rules r
         JOIN behaviors b ON b.id = r.behavior_id
        WHERE r.qa_override = 0 AND b.status != 'deprecated'
        ORDER BY r.confidence ASC, r.created_at ASC`,
    )
    .all() as (RuleRow & { behavior_name: string; behavior_criticality: string })[];
  return rows.map((row) => {
    const { behavior_name, behavior_criticality, ...ruleRow } = row;
    return {
      rule: hydrate(ruleRow),
      behavior_name,
      behavior_criticality,
      under_review: ruleRow.confidence < UNDER_REVIEW_BELOW,
    };
  });
}

export function getRuleById(db: Database, id: string): Rule | null {
  const row = db.prepare("SELECT * FROM rules WHERE id = ?").get(id) as
    | RuleRow
    | undefined;
  return row ? hydrate(row) : null;
}

// QA override: pins a rule as authoritative (confidence 1.0, qa_override=1)
// with a reason. Returns the updated rule, or null if the id is unknown.
export function overrideRule(
  db: Database,
  id: string,
  rule_text: string,
  reason: string,
  now: string = new Date().toISOString(),
): Rule | null {
  const res = db
    .prepare(
      `UPDATE rules
         SET rule_text = @rule_text, confidence = 1.0, qa_override = 1,
             override_reason = @reason, updated_at = @now
       WHERE id = @id`,
    )
    .run({ id, rule_text, reason, now });
  if (res.changes === 0) return null;
  return getRuleById(db, id);
}
