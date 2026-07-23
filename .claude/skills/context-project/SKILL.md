---
name: context-project
description: Carrega o contexto completo do qa-memory de uma vez — arquitetura, estado atual e como o conhecimento está organizado. Usar ao iniciar sessão neste repo, quando o usuário digitar /context-project, ou antes de qualquer trabalho que precise entender o projeto todo.
---

# context-project

Objetivo: entender o qa-memory inteiro em uma passada. Ler nesta ordem, parar quando tiver o suficiente.

## 1. O que é (30s)
qa-memory = **fonte de verdade do conhecimento da plataforma, em markdown, lida pelo Claude Code**.
NÃO é servidor, NÃO é banco, NÃO usa chave LLM. Pasta de arquivos + git + Claude.
- Busca → grep. Grafo → `[[wikilinks]]`. Versão → git. Raciocínio → Claude em contexto.

## 2. Ler estes arquivos (nesta ordem)
1. `CLAUDE.md` — convenções, frontmatter (contrato), padrões de uso (alimentar / plano de teste), token economy.
2. `knowledge/INDEX.md` — mapa de cobertura: quantos behaviors, quais áreas, tamanho de cada.
3. `MIGRATION-PLAN.md` — como chegou aqui (pivô de MCP/SQLite → markdown) e o que foi deferido por design.

## 3. Estrutura do conhecimento (git-ignored, dado real)
```
knowledge/
  INDEX.md              mapa de cobertura
  behaviors/*.md        1 comportamento/arquivo, regras inline, frontmatter (area, criticality, valid_from/to, sources)
  areas/*.md            agrupa e linka behaviors ([[wikilinks]]) — grafo bidirecional
  incidents/*.md        bugs/regressões, linkam o behavior afetado
```

## 4. Explorar sob demanda (não ler tudo)
- Área específica: `knowledge/areas/<slug>.md` → segue os `[[links]]` pros behaviors.
- Busca por tema: `grep` em `knowledge/behaviors/`.
- Ler só o que a tarefa exige. NUNCA ler os 116 behaviors de uma vez.

## Regras que valem sempre
- `knowledge/` tem dado real da empresa → git-ignored. Nunca commitar conteúdo de lá.
- Sem servidor/índice/embeddings até o grep falhar de verdade (deferido por design).
- `.qa-memory/` = backup do SQLite antigo. Não usar, é histórico.
