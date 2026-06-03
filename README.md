# qa-memory

A QA knowledge layer that plugs into your AI coding assistant as an MCP server. Feed it product specs, Jira tasks, and Confluence pages — it extracts behaviors and business rules, embeds them locally, and answers questions like *"what's the risk of touching this area?"* or *"what might break if we change this?"* without leaving your editor.

---

## What it does

- **Remembers product knowledge** — behaviors (what the product does) and rules (constraints, business logic) extracted from text sources via LLM or structured directly by an agent.
- **Scores risk** — given a file path or feature area, returns a risk score, the relevant behaviors, their rules, and the history of what already broke there.
- **Analyzes impact** — given a proposed change in plain language, reasons about what may break, what to watch when testing, and which existing rules conflict.
- **Curates itself** — a memory-keeper agent reviews inferred rules, detects duplicates, and proposes promotions to QA-confirmed. You stay in control; it proposes, you approve.
- **Works locally** — embeddings via `sentence-transformers` (no API), LLM extraction via Ollama, Anthropic, or Gemini. Your product knowledge never leaves your machine unless you choose otherwise.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 | |
| pnpm | any | `npm i -g pnpm` if not installed |
| uv | any | [docs.astral.sh/uv](https://docs.astral.sh/uv) |
| Ollama | optional | For local LLM extraction — [ollama.com](https://ollama.com) |

---

## Installation

```powershell
# Windows
git clone https://github.com/JeanSantos89/QA-memory.git && cd QA-memory
pwsh -File scripts/install.ps1
```

```bash
# macOS / Linux
git clone https://github.com/JeanSantos89/QA-memory.git && cd QA-memory
./scripts/install.sh
```

The script:
1. Checks prerequisites
2. Installs and builds the MCP server (TypeScript)
3. Installs the ingestion package (Python)
4. Initializes your local instance at `.qa-memory/` (git-ignored — your product knowledge stays private)
5. Prints the MCP config snippet to paste into Claude Code

**Flags:** `--check` (only verify prerequisites), `--no-seed` (skip dogfood data).

---

## Connecting to Claude Code

After install, paste the printed snippet into your Claude Code MCP settings (`.mcp.json`):

```json
{
  "mcpServers": {
    "qa-memory": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "QA_MEMORY_DB": ".qa-memory/qa-memory.db",
        "QA_MEMORY_LLM": "ollama",
        "QA_MEMORY_LLM_MODEL": "llama3.1"
      }
    }
  }
}
```

---

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `QA_MEMORY_DB` | `.qa-memory/qa-memory.db` | Path to the SQLite database |
| `QA_MEMORY_LLM` | `anthropic` | LLM provider: `anthropic` \| `gemini` \| `ollama` |
| `QA_MEMORY_LLM_MODEL` | provider default | Model override (e.g. `qwen2.5:14b` for Ollama) |
| `QA_MEMORY_LANG` | `en` | Output language: `en` \| `pt-BR` |
| `QA_MEMORY_INGESTION_DIR` | package path | Path to the ingestion package (auto-detected) |

**Recommended model for analysis:** `qwen2.5:14b` locally. The 8B model works for extraction; 14B+ is needed for reliable impact analysis.

---

## MCP Tools

Once connected, these tools are available to your AI assistant:

| Tool | What it does |
|------|-------------|
| `feed_to_memory` | Persist behaviors + rules from structured JSON — **no LLM call** (agent is the extractor). Use this for Jira/Confluence content already in context. |
| `add_to_memory` | Ingest raw text, a local file, or a public URL — LLM extracts behaviors + rules internally. |
| `query_behavior` | Search product behaviors by free text. |
| `query_risk` | Get a risk score + matched behaviors + rules for a feature area or file path. |
| `analyze_impact` | Reason about a proposed change: what may break, what to watch, which rules conflict. |
| `map_area` | Associate a file glob (e.g. `checkout/**/*.ts`) with its behaviors so `query_risk` can resolve by path. |
| `update_rule` | Define or override a rule in QA voice (pins it as confirmed, confidence 1.0). |
| `record_incident` | Record something that broke — lifts the risk score for that area with recency + severity weighting. |
| `review_memory` | List inferred rules awaiting QA confirmation (the memory-keeper's worklist). |
| `find_duplicate_rules` | Detect clusters of near-duplicate rules across behaviors. |
| `retire_rule` | Retire a redundant rule (sets status to superseded, removes from all reads). |

---

## Typical workflows

### Feed knowledge from a Jira task
Ask your assistant to read the task and save it:
> *"Read PROJ-456 and save the product rules to memory."*

The assistant fetches the task via the Atlassian MCP, structures it as behaviors + rules, and calls `feed_to_memory` — no internal LLM call, just local embeddings.

### Assess risk before testing
> *"What's the risk of touching the checkout payment flow?"*

Returns a risk score, the matched behaviors, their rules, and any recorded incidents (what already broke there).

### Generate a test plan for a task
> *"Create a test plan for PROJ-789 — consider the new functionality and what might regress."*

The assistant reads the task, calls `query_risk` for the affected areas, calls `analyze_impact` for the proposed change, and generates a plan with **new cases** and **regression cases** ranked by criticality.

### Analyze the impact of a change
> *"What breaks if we allow free cancellation up to 5 minutes after the restaurant accepts?"*

Returns what may break, what to watch when testing, and which existing rules conflict — reasoned against everything already in memory.

---

## Project structure

```
packages/
  mcp-server/     TypeScript — MCP server, tools, search, risk scoring, embedder
  ingestion/      Python — LLM extraction pipeline, PDF/URL sources, impact analysis
scripts/
  install.ps1     Windows setup
  install.sh      macOS/Linux setup
docs/
  STATE.md        Current development status (living doc)
  SCHEMA.md       SQLite schema source of truth
  DECISIONS.md    Architecture decision log
.githooks/        Commit/push guards (doc enforcement, neutrality scan)
.qa-memory/       Your local instance — git-ignored, never committed
```

---

## Privacy

Your product knowledge lives in `.qa-memory/` which is git-ignored. The repo contains only neutral code and documentation — no company names, internal URLs, real ticket keys, or customer data. Clone it, point it at your product, and your knowledge stays local.

To protect against accidental leaks, copy `.githooks/neutrality.local.example` to `.githooks/neutrality.local` and fill in your company-specific terms. The pre-commit and pre-push hooks will block any staged content that matches.

---

## Development

```powershell
# MCP server (TypeScript)
cd packages/mcp-server
pnpm install && pnpm build
pnpm test          # Vitest
pnpm typecheck     # tsc --noEmit

# Ingestion (Python)
cd packages/ingestion
uv sync
uv run pytest
uv run ruff check src/
uv run mypy src/
```

Commit discipline: one block = code + tests + living doc update in the same commit. The pre-commit hook blocks code changes without a corresponding doc update.
