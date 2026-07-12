# Contributing

This is a personal side project, built for my own QA workflow and shared as-is.
It is **not actively maintained** as a community project — issues and PRs are
welcome, but responses may be slow and scope is deliberately narrow.

## If you still want to contribute

- Read `CLAUDE.md` and `docs/` first (`STATE.md`, `SCHEMA.md`, `DECISIONS.md`).
  Architectural decisions already made are logged in `docs/DECISIONS.md` and are
  not re-litigated in PRs.
- Work in blocks: one coherent unit + tests + living-doc update per commit.
  A pre-commit hook (`.githooks/pre-commit`) enforces this — enable it with
  `git config core.hooksPath .githooks`.
- Keep the repo neutral: no company names, internal URLs, real ticket keys,
  customer data, or credentials. Instance data lives only in the git-ignored
  `.qa-memory/` directory and env vars.
- Tests: `pnpm test` (packages/mcp-server) and `uv run pytest`
  (packages/ingestion) must pass. TypeScript is strict; Python is mypy-strict
  and ruff-clean.
- No new dependencies without checking whether an existing one solves it.

## Not in scope

- Support for editors/agents other than Claude Code (v1 decision).
- Cloud/remote storage backends — SQLite is the storage layer.
- API-based embeddings — embeddings stay local (sentence-transformers).
