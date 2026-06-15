"""
Substituto local do analyze_impact (que exige LLM provider).
Recebe uma descricao de mudanca e retorna behaviors + rules potencialmente impactados
usando busca por tokens no SQLite — zero LLM, zero MCP.

Uso:
  python tools/analyze_impact_local.py "removemos o campo X da tela de exportacao"

Saida: JSON com behaviors impactados ordenados por score descendente.
Score = fracao de tokens da query que aparecem em name+description+rules do behavior.
"""
import sqlite3, sys, json, re
from collections import defaultdict

import os
DB = os.environ.get("QA_MEMORY_DB", "QA-memory/.qa-memory/qa-memory.db")

def tokenize(text: str) -> set[str]:
    return {w.lower() for w in re.split(r"\W+", text) if len(w) >= 3}

def main():
    if len(sys.argv) < 2:
        print("Uso: python analyze_impact_local.py \"descricao da mudanca\"")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    query_tokens = tokenize(query)

    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row

    behaviors = db.execute(
        "SELECT id, name, description, criticality FROM behaviors WHERE status='active'"
    ).fetchall()

    results = []
    for b in behaviors:
        rules = db.execute(
            "SELECT rule_text, confidence FROM rules WHERE behavior_id=? AND status='active'",
            (b["id"],),
        ).fetchall()

        corpus = f"{b['name']} {b['description']} " + " ".join(r["rule_text"] for r in rules)
        corpus_tokens = tokenize(corpus)

        hits = query_tokens & corpus_tokens
        if not hits:
            continue

        score = len(hits) / len(query_tokens)
        results.append({
            "behavior": b["name"],
            "criticality": b["criticality"],
            "score": round(score, 2),
            "matched_tokens": sorted(hits),
            "rules_count": len(rules),
        })

    db.close()

    results.sort(key=lambda x: (-x["score"], x["criticality"]))

    if not results:
        print(json.dumps({"message": "Nenhum behavior impactado encontrado.", "query": query}))
        return

    print(json.dumps({"query": query, "impacted": results}, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
