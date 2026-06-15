"""
Detecta behaviors com nome duplicado no DB antes de ingerir novo conteudo.
Uso: python tools/check_duplicates.py
Saida: lista de grupos duplicados com IDs e contagem de rules.
Nao faz nenhuma alteracao — so leitura.
"""
import sqlite3, json, sys
from collections import defaultdict

import os
DB = os.environ.get("QA_MEMORY_DB", "QA-memory/.qa-memory/qa-memory.db")

db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

rows = db.execute(
    "SELECT id, name, status, created_at FROM behaviors WHERE status='active' ORDER BY name, created_at"
).fetchall()

groups = defaultdict(list)
for r in rows:
    rule_count = db.execute(
        "SELECT count(*) FROM rules WHERE behavior_id=? AND status='active'", (r["id"],)
    ).fetchone()[0]
    groups[r["name"]].append({"id": r["id"], "created_at": r["created_at"], "rules": rule_count})

db.close()

duplicates = {name: entries for name, entries in groups.items() if len(entries) > 1}

if not duplicates:
    print("OK — nenhum behavior duplicado encontrado.")
    sys.exit(0)

print(f"ATENCAO — {len(duplicates)} behavior(s) com nome duplicado:\n")
for name, entries in duplicates.items():
    print(f"  '{name}'")
    for e in entries:
        print(f"    id={e['id'][:8]}  rules={e['rules']}  criado={e['created_at'][:10]}")
print("\nAcao recomendada: manter o mais antigo como canonico, migrar rules e aposentar os demais.")
sys.exit(1)
