# qa-memory

**A fonte de verdade do conhecimento de QA de um produto — em markdown, versionada em git, lida pelo seu assistente de IA.**

Sem servidor. Sem banco. Sem chave de LLM. Uma pasta de arquivos que o Claude Code lê, cruza e mantém.

---

## O problema

O conhecimento profundo de um produto — o que cada área faz de verdade, quais as regras de
negócio reais (não as que estão na doc), o que quebra quando você mexe em X — vive na cabeça
das pessoas, em planilhas e em threads soltas. Ele **evapora**: some quando alguém troca de
time, e um novo QA/dev começa do zero perguntando "é seguro mexer aqui?".

## A ideia

`qa-memory` transforma esse conhecimento em **arquivos markdown** que o assistente de IA
consulta durante o trabalho real. Cada comportamento do produto é um arquivo legível, com
suas regras de negócio, agrupado por área e ligado aos demais. O conhecimento **acumula em
vez de evaporar** — e nunca sai da sua máquina.

Pergunte ao assistente *"quais as regras da área de exportação?"* ou *"gere um plano de teste
pra essa task, considerando o que pode regredir"* e ele responde a partir de tudo que o time
já registrou.

---

## Como funciona

Nenhuma peça de infraestrutura. Cada capacidade sai de uma ferramenta que já existe:

| Precisa de | Resolve com |
|---|---|
| Verdade legível e editável | **markdown** — um arquivo por comportamento |
| Histórico e versão ("como era antes?") | **git** |
| Grafo (área ↔ comportamentos, relações) | **`[[wikilinks]]`** entre arquivos |
| Busca | **grep** / o próprio assistente |
| Raciocínio (impacto, contradição, extração) | **o assistente de IA em contexto** — custo zero de LLM próprio |

O resultado: um sistema de conhecimento que qualquer um clona, aponta pro seu produto, e usa
— com os dados sensíveis ficando 100% locais.

---

## Estrutura

```
knowledge/                 (git-ignored: seu conhecimento real fica privado)
  INDEX.md                 mapa de cobertura — quantos comportamentos, quais áreas
  behaviors/<slug>.md      1 comportamento/arquivo: frontmatter + regras inline
  areas/<slug>.md          agrupa e linka comportamentos (grafo bidirecional)
  incidents/<slug>.md      bugs/regressões, ligados ao comportamento afetado
```

Cada comportamento tem frontmatter que vira contrato de consulta:

```markdown
---
type: behavior
criticality: P1                 # P0 crítico/financeiro → P3 cosmético
confirmed_by_qa: true
area: [[exportacao]]
valid_from: 2026-05-30
valid_to: null                  # null = verdade hoje
sources: [PROJ-123, spec.pdf]
---
# Exportação de planilha

Descrição do comportamento real.

## Regras
- **[conf 1.0, QA]** Exportação debita saldo da empresa por linha exportada.
- **[conf 0.7]** Falha de saldo cancela a exportação inteira (sem débito parcial).
```

---

## Uso com o Claude Code

Aponte o Claude Code para o repositório. Ele descobre a estrutura sozinho (há uma skill
`/context-project` que carrega o contexto todo de uma vez).

**Alimentar conhecimento** — cole um ticket ou página e peça pra salvar. O assistente
estrutura em comportamento + regras e escreve o `.md`. Antes de gravar, checa se contradiz
alguma regra existente e avisa.

**Consultar risco** — *"quais regras e incidentes da área de checkout?"* → ele lê os arquivos
da área e responde com criticidade e histórico.

**Plano de teste** — *"plano de teste pra PROJ-789"* → duas seções: **novos casos** (o que a
task adiciona) e **regressão** (o que pode quebrar, priorizado por criticidade e incidentes).

---

## Princípios de design

- **Local-first.** O conhecimento (`knowledge/`) é git-ignored. O repositório público carrega
  só código e docs neutros — nenhum nome de empresa, URL interna ou chave de projeto real.
- **Token-zero por padrão.** O assistente é o extrator e o raciocinador; não há LLM próprio
  queimando tokens. Alimente por área, sob demanda.
- **Sem abstração especulativa.** Nada de servidor, índice vetorial ou pipeline enquanto o
  grep resolve. O caminho de upgrade (embeddings locais + sqlite-vec) existe — só quando o
  volume realmente exigir.

---

## Contexto

Reescrito de um servidor MCP + SQLite para esta arquitetura markdown-native.
O histórico e o racional do pivô estão em [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md).
