# qa-memory

Fonte de verdade do conhecimento da plataforma, em markdown, lida pelo Claude Code.

## O que é

Pasta `knowledge/` com um arquivo por comportamento do produto (regras de negócio inline).
Sem servidor, sem banco, sem chave LLM. Claude Code lê, grepa e edita direto.

- **Busca** → grep / Claude
- **Grafo** → `[[wikilinks]]` entre arquivos
- **Versão / histórico** → git
- **Raciocínio (impacto, contradição, extração)** → Claude em contexto

## Uso

- Consultar: pergunte ao Claude Code — ele lê `knowledge/`.
- Alimentar: cole um ticket/página e peça pra salvar. Claude estrutura e escreve o `.md`.
- Regras: `type`, `criticality` (P0-P3), `confirmed_by_qa`, `valid_from/to`, `sources` no frontmatter.

## Privacidade

`knowledge/` tem dado real da empresa → git-ignored. Repo mantém só código/docs neutros.

## Upgrade (só se precisar)

Se o grep falhar no volume, aí sim: índice de embeddings local + sqlite-vec.
Enquanto for centenas de arquivos, não precisa.
