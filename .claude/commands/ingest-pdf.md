# SKILL: ingest-pdf — Ingestão de PDF com contexto da memória

## Quando usar

Invocar com `/ingest-pdf` sempre que o usuário quiser salvar um PDF (run de testes, plano de
testes, spec, relatório) na qa-memory. O argumento `$ARGUMENTS` é o caminho do arquivo.

**Não usar `add_to_memory` diretamente** — requer LLM key no servidor.  
Este fluxo usa `ingest_pdf.py --ingest` (zero LLM extra) com JSON gerado pelo Claude.

---

## Fluxo obrigatório

### Passo 1 — Extrair texto do PDF (nunca ler o PDF direto)

Sempre extrair o texto antes de ler. Isso evita tokens de visão (imagens renderizadas).

1. Execute o script de extração passando o caminho do PDF fornecido pelo usuário:

```powershell
powershell -File "C:\Users\jean.santos_cortex-i\Documents\qa-memory-1\tools\pdf-extract.ps1" "<caminho_do_pdf>"
```

O script gera um `.txt` na mesma pasta do PDF e exibe o caminho na saída.

2. Leia o `.txt` gerado com a tool `Read` (não o PDF original).

Se o script reportar "ESCANEADO" (PDF sem texto extraível), informe o usuário e interrompa.

### Passo 2 — Extrair áreas do conteúdo

Com base no conteúdo do `.txt`, identifique de 2 a 5 **áreas funcionais** tocadas pelo documento.

Faça isso inline, sem tool call.

### Passo 3 — Buscar behaviors existentes para cada área

Para cada área identificada, chame `mcp__qa-memory__query_behavior` com o nome da área.

```
query_behavior(query="<área>")
```

Colete os slugs e nomes retornados. O objetivo é **reusar slugs existentes** em vez de criar duplicatas.

### Passo 4 — Gerar o JSON estruturado

Monte o JSON seguindo o schema abaixo. Regras:

- **Reusar slug existente** se o behavior já existe na memória (slug do Passo 3).
- **Criar novo slug** (kebab-case único) apenas se não há match na memória.
- `criticality`: P0 = financeiro/crítico, P1 = fluxo principal, P2 = secundário, P3 = cosmético.
- `confidence`: 1.0 + `qa_override: true` para regras explicitamente validadas pelo QA;
  0.7 para inferências seguras sem confirmação explícita.
- `source_ref`: chave Jira do ticket (ex: "ONM-2950") ou nome descritivo do documento.
- **Não registrar bugs abertos ou riscos** como rules — apenas se o usuário pedir.

```json
{
  "source_ref": "<ticket ou label>",
  "label": "<descrição curta>",
  "behaviors": [
    {
      "slug": "<slug-existente-ou-novo>",
      "name": "<Nome legível>",
      "description": "<O que esse behavior cobre>",
      "criticality": "P0|P1|P2|P3",
      "rules": [
        {
          "rule_text": "<Regra em linguagem natural.>",
          "confidence": 1.0,
          "qa_override": true
        }
      ]
    }
  ]
}
```

**Não criar uma rule por passo de teste** — criar rules que expressem **comportamentos e
restrições esperados** (o "deve", "não deve", "sempre", "nunca").

### Passo 5 — Salvar o JSON e ingerir

1. Salve o JSON em `tools/<source_ref>_ingest.json` no projeto qa-memory-1.
2. Execute:

```
python tools/ingest_pdf.py --ingest tools/<source_ref>_ingest.json
```

O caminho do projeto é: `C:\Users\jean.santos_cortex-i\Documents\qa-memory-1`

### Passo 6 — Confirmar ao usuário

Reporte apenas:
- Quantos behaviors foram **reusados** (slug já existia) vs **criados** (novos).
- Quantas rules foram persistidas.

---

## Resumo do fluxo

```
PDF fornecido pelo usuário
  → pdf-extract.ps1 → .txt
  → Read no .txt (barato)
  → extrair áreas (inline)
  → query_behavior por área (MCP)
  → montar JSON com slugs corretos
  → salvar JSON + python --ingest
  → confirmar
```

Nenhum subagente. Nenhum `add_to_memory`. Tudo inline.
