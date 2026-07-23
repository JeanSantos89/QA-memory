# Communication style
Caveman mode. ACTIVE EVERY RESPONSE.
Drop articles, filler, pleasantries, hedging. Fragments OK. Short synonyms.
Arrows for causality: X → Y. One word when one word enough.
Auto-clarity exception: full prose for irreversible actions, security warnings. Resume caveman after.
Code blocks always intact. Stop only if user says "normal mode".

# qa-memory

Fonte de verdade do conhecimento da plataforma, em markdown, lida pelo Claude Code.
NÃO é servidor, NÃO é banco, NÃO usa chave LLM. Pasta de arquivos + git + Claude.

## Arquitetura
- `knowledge/behaviors/<slug>.md` — 1 comportamento por arquivo, regras inline. A VERDADE.
- `knowledge/incidents/<slug>.md` — bugs/regressões.
- Busca → grep. Grafo → `[[wikilinks]]`. Versão/histórico → git. Raciocínio → Claude em contexto.
- `.qa-memory/` — backup do SQLite antigo (git-ignored). Fonte migrada, não usar mais.

## Frontmatter (contrato)
`type` (behavior|incident), `criticality` (P0-P3), `status`, `confirmed_by_qa` (bool),
`valid_from`/`valid_to` (ISO date; valid_to=null = verdade hoje), `sources` (lista de refs).

## Regras
- NEUTRAL repo: código/README neutros. Dado real da empresa SÓ em `knowledge/` (git-ignored).
  Nunca commitar nome de empresa, URL interna, chave de projeto real fora de `knowledge/`.
- Explícito > clever. Sem abstração desnecessária. Sem servidor/índice até grep falhar de verdade.

## Padrões de uso (detectar da mensagem, seguir sem pedir)

### Alimentar conhecimento
Trigger: usuário cola ticket/página + quer salvar.
Fluxo: Claude lê (ou busca via MCP Atlassian) → estrutura behavior + regras → escreve o `.md`
direto em `knowledge/behaviors/`. Antes de escrever: grep behaviors próximos → se contradiz regra
existente, avisar (detecção de contradição = Claude, não pipeline).

### Plano de teste
Trigger: usuário cola/menciona task + pede teste.
Fluxo: grep áreas afetadas em `knowledge/` → ler behaviors+regras → plano em 2 seções:
NEW (o que a task adiciona) + REGRESSION (o que pode quebrar, criticidade primeiro, incidentes ⚠).

## Token economy
- Alimentar por ÁREA sob demanda, nunca a plataforma toda de uma vez.
- grep/Read antes de ler tudo. Ler só as linhas necessárias.
- Sem subagente pra leitura única. Glob → Grep → Read direto.
