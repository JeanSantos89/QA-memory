"""Impact analysis — the leap from searchable memory to a QA impact copilot.

Given a PROPOSED change in free text, this:
  1. retrieves the rules already in memory that relate to it (semantic over
     behavior embeddings + LIKE backfill — same hybrid intent as search.ts),
  2. asks the LLM to reason about that change AGAINST those rules,
  3. returns structured analysis: what may break, what to watch when testing,
     and which EXISTING rules the change conflicts with / affects.

query_risk only does retrieval + a derived score; it never reasons about
conflict. This module fills that gap. The LLM lives in Python (single source of
extraction/analysis truth, like the extractor), so analysis lives here too.

Every LLM call logs tokens (CLAUDE.md). Prompt is caveman-terse.
"""

from __future__ import annotations

import json
import re
import sqlite3
from array import array
from dataclasses import dataclass, field

from qa_memory.pipeline.crosslang import translate_query
from qa_memory.pipeline.embeddings import EMBEDDING_DIM, EmbeddingModel
from qa_memory.pipeline.extractor import TokenUsage, _parse_json
from qa_memory.pipeline.llm import LLMClient

# Mirror search.ts: below this cosine a behavior is treated as unrelated.
SEMANTIC_FLOOR = 0.25
RETRIEVAL_LIMIT = 10
ANALYSIS_MAX_TOKENS = 1024

_ANALYSIS_SYSTEM = (
    "QA impact analyst. Given a PROPOSED change and the EXISTING product rules "
    "in memory, reason about impact. Output JSON only: "
    '{"breaks": [str], "watch": [str], '
    '"conflicts": [{"rule": str, "why": str}]}. '
    "breaks = what may break. watch = what to pay attention to when testing. "
    "conflicts = existing rules the change contradicts/affects (rule = the rule "
    "text, why = how it conflicts). "
    "RULES: "
    "(1) If the change has MULTIPLE parts (e.g. joined by 'and'), analyze EVERY "
    "part separately — never drop one. "
    "(2) watch must NOT be empty for a real change: always name concrete test "
    "angles (edge cases, data/state, money/fraud, regressions). "
    "(3) Only list a conflict when the change genuinely contradicts or alters "
    "that rule — do not pad with weak/speculative links. "
    "(4) Quote the conflicting rule's actual text in `rule`, not a paraphrase. "
    "Empty lists ONLY when truly nothing applies. "
    "Reply in the language of the proposed change."
)


@dataclass(frozen=True)
class Conflict:
    rule: str
    why: str


@dataclass
class ImpactAnalysis:
    breaks: list[str] = field(default_factory=list)
    watch: list[str] = field(default_factory=list)
    conflicts: list[Conflict] = field(default_factory=list)
    related_rules: list[str] = field(default_factory=list)
    usage: TokenUsage = field(default_factory=TokenUsage)
    # Set when cross-language retrieval degraded (LLM couldn't translate the
    # query); surfaced to the user so they know recall is limited (crosslang.py).
    note: str | None = None


@dataclass(frozen=True)
class _RelatedBehavior:
    behavior_id: str
    name: str
    description: str
    rules: list[str]


@dataclass
class _Retrieval:
    """retrieve_related's result: the related behaviors + an optional degrade
    note when cross-language translation couldn't be trusted (crosslang.py)."""

    related: list[_RelatedBehavior]
    note: str | None = None


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return float(dot / (na * nb))


def _unpack(blob: bytes) -> list[float]:
    arr = array("f")
    arr.frombytes(blob)
    return [float(x) for x in arr]


def _glob_to_re(pattern: str) -> re.Pattern[str]:
    """Compile a file glob to an anchored regex. Mirrors globToRegExp in areas.ts."""
    parts: list[str] = []
    i = 0
    p = pattern.replace("\\", "/")
    while i < len(p):
        c = p[i]
        if c == "*":
            if i + 1 < len(p) and p[i + 1] == "*":
                parts.append(".*")
                i += 2
                if i < len(p) and p[i] == "/":
                    i += 1
            else:
                parts.append("[^/]*")
                i += 1
        elif c == "?":
            parts.append("[^/]")
            i += 1
        else:
            parts.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(parts) + "$", re.IGNORECASE)


def _matches_glob(file_path: str, pattern: str) -> bool:
    return bool(_glob_to_re(pattern).match(file_path.replace("\\", "/")))


def _looksLikePath(text: str) -> bool:
    """Heuristic: does this look like a file path rather than free text?
    Mirrors looksLikePath in server.ts."""
    return bool(re.search(r"[/\\]|\.[a-z0-9]+$", text.strip(), re.IGNORECASE))


def _behaviors_for_path(conn: sqlite3.Connection, path: str) -> list[str]:
    """Return behavior_ids whose area glob matches `path`. Mirrors behaviorIdsForPath
    in areas.ts — allows analyze_impact to resolve paths the same way query_risk does."""
    areas = conn.execute("SELECT file_pattern, behavior_ids FROM areas").fetchall()
    ids: list[str] = []
    seen: set[str] = set()
    for pattern, behavior_ids_json in areas:
        if _matches_glob(path, str(pattern)):
            for bid in json.loads(str(behavior_ids_json)):
                sid = str(bid)
                if sid not in seen:
                    seen.add(sid)
                    ids.append(sid)
    return ids


def _rules_for(conn: sqlite3.Connection, behavior_id: str) -> list[str]:
    # Hide under_review rules (confidence < 0.5) and retired ones
    # (status='superseded') — same contract as the MCP repo (migration 002).
    rows = conn.execute(
        "SELECT rule_text FROM rules "
        "WHERE behavior_id = ? AND confidence >= 0.5 AND status = 'active'",
        (behavior_id,),
    ).fetchall()
    return [str(r[0]) for r in rows]


def _collect_candidates(
    conn: sqlite3.Connection,
    query: str,
    query_vec: list[float],
    ordered_ids: list[str],
    meta: dict[str, tuple[str, str]],
    limit: int,
) -> None:
    """Add this query's semantic+LIKE candidates to ordered_ids/meta in place,
    skipping ids already seen. Semantic first (ranked by cosine), then LIKE
    backfill — mirrors search.ts. Called once per query variant so the original
    and the translated query UNION their candidates (cross-language recall)."""
    if len(query_vec) == EMBEDDING_DIM:
        emb_rows = conn.execute(
            """SELECT e.entity_id, e.vector, b.name, b.description
                 FROM embeddings e
                 JOIN behaviors b ON b.id = e.entity_id
                WHERE e.entity_type = 'behavior' AND b.status != 'deprecated'"""
        ).fetchall()
        scored = []
        for entity_id, blob, name, desc in emb_rows:
            score = _cosine(query_vec, _unpack(blob))
            if score >= SEMANTIC_FLOOR:
                scored.append((score, str(entity_id), str(name), str(desc)))
        scored.sort(key=lambda t: t[0], reverse=True)
        for _score, bid, name, desc in scored:
            if bid not in meta:
                ordered_ids.append(bid)
                meta[bid] = (name, desc)

    # Lexical (LIKE) candidates — active behaviors only.
    like = f"%{query}%"
    lexical_rows = conn.execute(
        """SELECT id, name, description FROM behaviors
             WHERE status != 'deprecated'
               AND (name LIKE ? OR description LIKE ?)
             LIMIT ?""",
        (like, like, limit),
    ).fetchall()
    for bid, name, desc in lexical_rows:
        if str(bid) not in meta:
            ordered_ids.append(str(bid))
            meta[str(bid)] = (str(name), str(desc))


def retrieve_related(
    conn: sqlite3.Connection,
    change: str,
    embed_model: EmbeddingModel | None,
    limit: int = RETRIEVAL_LIMIT,
    precomputed_vector: list[float] | None = None,
    client: LLMClient | None = None,
) -> _Retrieval:
    """Find behaviors related to the proposed change: semantic over behavior
    embeddings (cosine >= floor), backfilled with LIKE matches. Mirrors
    search.ts so analysis sees the same candidates the query tools would.

    If `precomputed_vector` is given (the MCP server embeds the change with its
    WARM embedder, ADR 020/026), the cold model load here is skipped for the
    ORIGINAL query — `embed_model` may then be None.

    Cross-language (PT<->EN): when `client` is given, the query is also
    translated to the other language and its candidates UNIONed in, so a PT
    query reaches EN-stored rules and vice versa. The all-MiniLM embedder is
    English-centric, so without this a cross-language query returns 0 (proven
    live, STATE). If the LLM can't produce a trustworthy translation, retrieval
    degrades to the original query and a note is returned. `embed_model` (cold)
    embeds the translation when available; otherwise the translation falls back
    to LIKE-only. No reindexing of stored vectors.
    """
    q = change.strip()
    if not q:
        return _Retrieval(related=[])

    ordered_ids: list[str] = []
    meta: dict[str, tuple[str, str]] = {}

    # Path resolution: if the change looks like a file path, prepend behaviors
    # mapped to that path via area globs (same as query_risk does in server.ts).
    # This lets "analyze_impact checkout/pay.ts" find relevant behaviors even when
    # the path string has no semantic similarity to behavior descriptions.
    if _looksLikePath(q):
        for bid in _behaviors_for_path(conn, q):
            row = conn.execute(
                "SELECT name, description FROM behaviors WHERE id = ? AND status != 'deprecated'",
                (bid,),
            ).fetchone()
            if row and bid not in meta:
                ordered_ids.append(bid)
                meta[bid] = (str(row[0]), str(row[1]))

    # Original-language pass.
    if precomputed_vector is not None:
        orig_vec = precomputed_vector
    elif embed_model is not None:
        orig_vec = embed_model.encode([q])[0]
    else:
        orig_vec = []
    _collect_candidates(conn, q, orig_vec, ordered_ids, meta, limit)

    # Cross-language pass: translate to the other PT<->EN language and union.
    note: str | None = None
    if client is not None:
        translation, degrade_note = translate_query(q, client)
        if translation:
            # Embed the translation cold if a model is on hand; the precomputed
            # vector only covers the original query's language.
            trans_vec = embed_model.encode([translation])[0] if embed_model else []
            _collect_candidates(conn, translation, trans_vec, ordered_ids, meta, limit)
        else:
            note = degrade_note

    # Incident-semantic pass: surface behaviors whose INCIDENT titles/descriptions
    # semantically match the query, even when the behavior description itself
    # doesn't. Fixes the gap where analyze_impact is blind to incident history
    # when the behavior text doesn't overlap with the change query (Issue 6).
    if orig_vec and len(orig_vec) == EMBEDDING_DIM and len(ordered_ids) < limit:
        inc_rows = conn.execute(
            """SELECT e.entity_id, e.vector, i.behavior_id
                 FROM embeddings e
                 JOIN incidents i ON i.id = e.entity_id
                WHERE e.entity_type = 'incident'"""
        ).fetchall()
        inc_scored: list[tuple[float, str]] = []
        for _inc_id, blob, behavior_id in inc_rows:
            score = _cosine(orig_vec, _unpack(blob))
            if score >= SEMANTIC_FLOOR:
                inc_scored.append((score, str(behavior_id)))
        inc_scored.sort(key=lambda t: t[0], reverse=True)
        for _s, bid in inc_scored:
            if bid not in meta and len(ordered_ids) < limit:
                sql = (
                    "SELECT name, description FROM behaviors"
                    " WHERE id = ? AND status != 'deprecated'"
                )
                row = conn.execute(sql, (bid,)).fetchone()
                if row:
                    ordered_ids.append(bid)
                    meta[bid] = (str(row[0]), str(row[1]))

    out: list[_RelatedBehavior] = []
    for bid in ordered_ids[:limit]:
        name, desc = meta[bid]
        out.append(_RelatedBehavior(bid, name, desc, _rules_for(conn, bid)))
    return _Retrieval(related=out, note=note)


def _build_user_prompt(change: str, related: list[_RelatedBehavior]) -> str:
    if not related:
        rules_block = "(memory has no related rules yet)"
    else:
        lines = []
        for b in related:
            lines.append(f"- {b.name}: {b.description}")
            for r in b.rules:
                lines.append(f"    rule: {r}")
        rules_block = "\n".join(lines)
    return f"PROPOSED CHANGE:\n{change}\n\nEXISTING RULES IN MEMORY:\n{rules_block}"


def analyze_impact(
    conn: sqlite3.Connection,
    change: str,
    client: LLMClient,
    embed_model: EmbeddingModel | None,
    limit: int = RETRIEVAL_LIMIT,
    precomputed_vector: list[float] | None = None,
) -> ImpactAnalysis:
    """Retrieve related rules → ask the LLM to reason about impact → parse.

    Deps injected (client + embed_model are Protocols) → unit-testable with
    fakes, no network/torch/key. Pass `precomputed_vector` to reuse a warm
    embedding and skip the cold model load (ADR 026). The same `client` drives
    cross-language retrieval (PT<->EN) so the analysis sees rules stored in the
    other language; if it can't translate, a `note` flags degraded recall.
    """
    retrieval = retrieve_related(
        conn, change, embed_model, limit, precomputed_vector, client
    )
    related = retrieval.related
    related_rules = [r for b in related for r in b.rules]

    resp = client.complete(
        _ANALYSIS_SYSTEM, _build_user_prompt(change, related), ANALYSIS_MAX_TOKENS
    )
    usage = TokenUsage()
    usage.add(resp)
    data = _parse_json(resp.text)

    def _str_list(key: str) -> list[str]:
        raw = data.get(key, [])
        if not isinstance(raw, list):
            return []
        return [str(x).strip() for x in raw if str(x).strip()]

    conflicts: list[Conflict] = []
    raw_conflicts = data.get("conflicts", [])
    if isinstance(raw_conflicts, list):
        for raw in raw_conflicts:
            if isinstance(raw, dict):
                rule = str(raw.get("rule", "")).strip()
                why = str(raw.get("why", "")).strip()
                if rule or why:
                    conflicts.append(Conflict(rule=rule, why=why))

    return ImpactAnalysis(
        breaks=_str_list("breaks"),
        watch=_str_list("watch"),
        conflicts=conflicts,
        related_rules=related_rules,
        usage=usage,
        note=retrieval.note,
    )
