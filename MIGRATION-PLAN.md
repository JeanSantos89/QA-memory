# Plano de migração — qa-memory → fonte de verdade markdown-native

> Decidido 2026-07-23. Rewrite total aprovado pelo dono. Modo ponytail (mínimo que funciona).

## Por que mudar (contexto)

Origem: projeto servia p/ entender regressão; dono quer usá-lo como **fonte de verdade
do conteúdo da plataforma**. Crítica que motivou o rewrite: superfícies boas (tools MCP,
risk score, curadoria) sobre **fundação rasa** — tabelas flat, BLOB opaco, sem tempo, dois
pacotes (TS+Python) por acidente histórico.

Restrições reais do dono (definem tudo):
- Só Claude Code. Sem chave LLM. Não pode instalar LLM local.
- Embeddings locais (sentence-transformers) FUNCIONAM (testado, dim=384) — mas viraram
  desnecessários na versão preguiçosa (grep resolve no volume atual).
- Volume médio (centenas). Uso solo. Dado sensível da empresa.

Consequência da restrição sem-chave: **Claude é o extrator**, não o servidor. Todo LLM
interno (add_to_memory, ingest_jira/confluence, analyze_impact, tradução) morre — Claude
faz em contexto, custo zero. `feed` (Claude estrutura → grava) já era zero-LLM por design.

## Análise competitiva (o que roubar / rejeitar)

- **basic-memory / EverOS** (markdown+git+MCP) → ROUBAR: markdown-native como verdade. Maior impacto.
- **Graphiti (Zep)** (bi-temporal KG) → ROUBAR leve: valid_from/to. REJEITAR: grafo pesado.
- **mem0 / MemOS** (memória genérica + detecção de contradição) → ROUBAR: Claude checa contradição
  na escrita. REJEITAR: ChromaDB, stack de servidor, memória genérica sem domínio.
- **Diferencial que MANTÉM** (ganha dos genéricos): modelo QA (criticality, incidents,
  risk, qa_override) + curadoria humana (memory-keeper) + local-first + token-zero.

Custo de token no modo novo: consulta ~1-3k, plano de teste 8-20k, alimentar 1 página ~5-10k.
Barato no uso diário; carga de conteúdo é controlável fazendo por área (não tudo de uma vez).

## Decisão central

**Markdown é a verdade. Claude Code é o motor. Nada mais precisa existir.**

Motivo: cliente é só Claude Code, volume é centenas de itens, uso solo, sem chave LLM.
Os dados provaram o rumo: 116 behaviors + 409 rules, mas **0 areas + 1 incident** →
o projeto sempre foi base de conhecimento da plataforma, nunca ferramenta de regressão.

Cada capacidade resolvida sem construir servidor:
- busca → grep (Claude faz)
- grafo → `[[wikilinks]]` nos arquivos
- tempo / versão → git
- raciocínio / impacto / extração → Claude em contexto
- servidor MCP, embeddings, sqlite-vec → **não existem** (add when grep+Claude falhar de verdade)

## Estrutura-alvo

```
knowledge/
  behaviors/<slug>.md    ← frontmatter + descrição + regras inline. A VERDADE.
  incidents/<slug>.md    ← (opcional; só 1 hoje)
.qa-memory/, packages/   ← LEGADO (SQLite + TS). Apagar no passo 3.
```

Formato do arquivo: ver `knowledge/behaviors/*.md` já gerados.
frontmatter: type, criticality, status, confirmed_by_qa, valid_from, valid_to, sources.

## Blocos de execução

Cada bloco = unidade coerente + verificação + 1 commit. Ordem importa.

### [x] Bloco 1 — Migração SQLite → markdown  (FEITO)
- Ação: script one-shot dump behaviors+rules → `knowledge/behaviors/*.md`.
- Feito: 116 arquivos, self-check OK. Script `migrate.py` (scratchpad), roda com python do `.venv`.
- Commit: ainda não commitado (ver Bloco 2 antes — neutralidade).

### [ ] Bloco 2 — Neutralidade / privacidade  (BLOQUEIA commit)
- Ação: `knowledge/` tem dado real da empresa → adicionar ao `.gitignore` OU tornar repo privado.
- Verificação: `git status` não lista conteúdo de `knowledge/`; hook de neutralidade passa.
- Commit: `.gitignore` + este plano.

### [x] Bloco 3 — Cabos soltos  (FEITO)
- Feito: 1 incident migrado → `knowledge/incidents/`, UTF-8 verificado. areas: ignorado (vazio).
- Não-feito de propósito: limpar rules conf<1.0 (Claude revisa quando tocar a área).

### [~] Bloco 4 — Apagar legado  (README feito; deleção bloqueada, aguarda usuário)
- Feito: README curto reescrito.
- Pendente (classificador bloqueou deleção em massa — usuário roda):
  `Remove-Item -Recurse -Force packages, scripts, docs, .github, .mcp.json.example`
- MANTER `.qa-memory/` como backup do `.db` original (git-ignored, única cópia da fonte).
- Nota: `CLAUDE.md` ainda descreve a arquitetura antiga (MCP/feed_to_memory) — stale, atualizar se incomodar.

### [x] Bloco 5 — Grafo + cobertura (ideal completo)
- Feito: `area:` no frontmatter de cada behavior (13 áreas, regras de keyword em migrate.py) +
  `knowledge/areas/<area>.md` linkando behaviors (`[[wikilinks]]`, grafo bidirecional) +
  `knowledge/INDEX.md` (mapa de cobertura). Zero Geral, zero LLM.
- Grupamento é heurístico (AREA_RULES) → refinar uma regra se um behavior cair na área errada.

### [x] Bloco 6 — Uso  (sem trabalho)
- Modo de operação: usar via Claude Code (grep + edição dos .md).
- Deferido por design (add when it hurts, NÃO é o ideal): sqlite-vec/embeddings, pipeline de
  contradição (Claude faz na escrita), temporalidade além do git (valid_to seta orgânico).

## O que NÃO fazer

- Não reconstruir MCP server / sqlite-vec / embeddings sem prova de que grep falha.
- Não migrar areas (sempre vazio). Não criar pipeline de ingestão (Claude extrai em contexto).
- Regra de neutralidade continua: `knowledge/` tem dado real da empresa → **git-ignored** ou repo privado.
```
