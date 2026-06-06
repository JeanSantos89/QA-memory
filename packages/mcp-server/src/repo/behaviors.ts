// Behaviors data access. Mock query layer for Fase 2 vertical slice:
// LIKE search over name/description (no embeddings yet — that lands in Fase 3).
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

export type Criticality = "P0" | "P1" | "P2" | "P3" | string;
export type BehaviorStatus = "active" | "deprecated" | "under_review";

export interface Behavior {
  id: string;
  name: string;
  description: string;
  criticality: Criticality;
  status: BehaviorStatus;
  source_ids: string[];
  confirmed_by_qa: boolean;
  qa_note: string | null;
  created_at: string;
  updated_at: string;
}

interface BehaviorRow {
  id: string;
  name: string;
  description: string;
  criticality: string;
  status: string;
  source_ids: string;
  confirmed_by_qa: number;
  qa_note: string | null;
  created_at: string;
  updated_at: string;
}

function hydrate(row: BehaviorRow): Behavior {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criticality: row.criticality,
    status: row.status as BehaviorStatus,
    source_ids: JSON.parse(row.source_ids) as string[],
    confirmed_by_qa: row.confirmed_by_qa === 1,
    qa_note: row.qa_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface NewBehavior {
  name: string;
  description: string;
  criticality: Criticality;
  status?: BehaviorStatus;
  source_ids?: string[];
  confirmed_by_qa?: boolean;
  qa_note?: string | null;
}

// Inserts a behavior, returns its id. Used by seeding + tests.
export function insertBehavior(
  db: Database,
  b: NewBehavior,
  now: string = new Date().toISOString(),
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO behaviors
       (id, name, description, criticality, status, source_ids, confirmed_by_qa, qa_note, created_at, updated_at)
     VALUES (@id, @name, @description, @criticality, @status, @source_ids, @confirmed_by_qa, @qa_note, @created_at, @updated_at)`,
  ).run({
    id,
    name: b.name,
    description: b.description,
    criticality: b.criticality,
    status: b.status ?? "active",
    source_ids: JSON.stringify(b.source_ids ?? []),
    confirmed_by_qa: b.confirmed_by_qa ? 1 : 0,
    qa_note: b.qa_note ?? null,
    created_at: now,
    updated_at: now,
  });
  return id;
}

export function countBehaviors(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM behaviors").get() as {
    c: number;
  };
  return row.c;
}

// Lists behaviors, most recent first. Excludes deprecated by default.
export function listBehaviors(
  db: Database,
  opts: { includeDeprecated?: boolean } = {},
): Behavior[] {
  const where = opts.includeDeprecated ? "" : "WHERE status != 'deprecated'";
  const rows = db
    .prepare(`SELECT * FROM behaviors ${where} ORDER BY created_at DESC, name ASC`)
    .all() as BehaviorRow[];
  return rows.map(hydrate);
}

// Non-deprecated behaviors that have a stored embedding, paired with the
// latest vector BLOB. Feeds semantic ranking (search.ts). One row per behavior
// (most recent embedding wins).
export function listBehaviorEmbeddings(db: Database): { behavior: Behavior; vector: Buffer }[] {
  const rows = db
    .prepare(
      `SELECT b.*, e.vector AS vector
         FROM behaviors b
         JOIN embeddings e
           ON e.entity_type = 'behavior' AND e.entity_id = b.id
        WHERE b.status != 'deprecated'
        GROUP BY b.id
       HAVING e.created_at = MAX(e.created_at)`,
    )
    .all() as (BehaviorRow & { vector: Buffer })[];
  return rows.map((row) => {
    const { vector, ...behaviorRow } = row;
    return { behavior: hydrate(behaviorRow), vector };
  });
}

// Fetches behaviors by id, excluding deprecated. Order follows the given ids
// (so an area's mapping order is preserved). Unknown ids are skipped.
export function behaviorsByIds(db: Database, ids: string[]): Behavior[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT * FROM behaviors WHERE id IN (${placeholders}) AND status != 'deprecated'`,
    )
    .all(...ids) as BehaviorRow[];
  const byId = new Map(rows.map((r) => [r.id, hydrate(r)]));
  return ids.map((id) => byId.get(id)).filter((b): b is Behavior => b !== undefined);
}

// A behavior inside a duplicate cluster, with peer count for display.
export interface DuplicateBehavior {
  behavior: Behavior;
}

// Default token-overlap threshold for behavior dedup. Slightly lower than
// rules (0.7) because behavior descriptions are longer and more varied.
export const DEFAULT_BEHAVIOR_DUP_THRESHOLD = 0.6;

// Language-agnostic normalization for behavior text (PT/EN): lowercase,
// non-alphanumeric → space, collapse + trim. Mirrors normalizeRuleText in rules.ts.
export function normalizeBehaviorText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function behaviorTokenSet(s: string): Set<string> {
  return new Set(normalizeBehaviorText(s).split(" ").filter(Boolean));
}

function behaviorJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Finds clusters of duplicate / near-duplicate behaviors across the DB.
// Two behaviors join a cluster when their normalized (name + description)
// text is identical OR their token-overlap (Jaccard) >= threshold.
// Detection only — never merges or deprecates (the keeper proposes,
// the user decides via deprecate_behavior). Clusters >= 2 only, largest first.
// Includes all non-deprecated behaviors (under_review is a behavior status
// in this schema, separate from rules' confidence gate).
export function findDuplicateBehaviors(
  db: Database,
  threshold: number = DEFAULT_BEHAVIOR_DUP_THRESHOLD,
): DuplicateBehavior[][] {
  const rows = db
    .prepare(
      `SELECT * FROM behaviors WHERE status != 'deprecated' ORDER BY created_at ASC`,
    )
    .all() as BehaviorRow[];

  const items = rows.map((row) => {
    const combined = `${row.name} ${row.description}`;
    return { behavior: hydrate(row), tokens: behaviorTokenSet(combined) };
  });

  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (behaviorJaccard(items[i]!.tokens, items[j]!.tokens) >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, DuplicateBehavior[]>();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push({ behavior: it.behavior });
  });

  return [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);
}

// Deprecates a behavior (status='deprecated') — e.g. the non-canonical member
// of a duplicate cluster after the user picked which one to keep. Deprecated
// behaviors drop out of every read (query_risk, query_behavior, embeddings).
// Returns the updated behavior, or null if the id is unknown.
export function deprecateBehavior(
  db: Database,
  id: string,
  reason: string,
  now: string = new Date().toISOString(),
): Behavior | null {
  const res = db
    .prepare(
      `UPDATE behaviors SET status = 'deprecated', qa_note = @reason, updated_at = @now WHERE id = @id`,
    )
    .run({ id, reason, now });
  if (res.changes === 0) return null;
  const row = db.prepare("SELECT * FROM behaviors WHERE id = ?").get(id) as
    | BehaviorRow
    | undefined;
  return row ? hydrate(row) : null;
}

// Case-insensitive LIKE over name + description (lexical fallback).
// Empty query → returns all (non-deprecated). Semantic ranking lives in search.ts.
export function queryBehavior(
  db: Database,
  query: string,
  limit = 10,
): Behavior[] {
  const q = query.trim();
  if (!q) return listBehaviors(db).slice(0, limit);
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT * FROM behaviors
       WHERE status != 'deprecated' AND (name LIKE ? OR description LIKE ?)
       ORDER BY confirmed_by_qa DESC, created_at DESC
       LIMIT ?`,
    )
    .all(like, like, limit) as BehaviorRow[];
  return rows.map(hydrate);
}
