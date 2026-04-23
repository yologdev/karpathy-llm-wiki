# Status Report

**Date:** 2026-04-23  
**Sessions completed:** ~43 (bootstrap 2026-04-06 → current 2026-04-23)  
**Build status:** ✅ PASS — 1054 tests, 18 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image preservation, CLI `ingest` command |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history, CLI `query` command |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering, CLI `lint` command |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, and began systematic component decomposition. Sessions 25–29 continued decomposition (hooks, components, lib modules), added configurable lint, and expanded test coverage. Sessions 30–35 focused on test backfill — writing dedicated test suites for every previously untested module. Session 35 also shipped a guided onboarding wizard and dark mode toggle. Sessions 36–40 pivoted to accessibility, mobile responsiveness, CLI tooling, and codebase consolidation — `process.env` bypasses eliminated, lint decomposed into focused modules, error boundaries on every page, and a fully wired CLI for headless operation. Sessions 41-43 continued polish — graph hook extraction, config consolidation, fuzzy search, image preservation during ingest, and Docker deployment (Dockerfile, docker-compose, DEPLOY.md).

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
CLI:        src/cli.ts — ingest, query, lint, list, status subcommands
Testing:    Vitest (1054 tests across 30 test files)
```

### Codebase size (~28,200 lines across ~131 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 6,813 | Core logic (ingest, query, lint, lint-checks, lint-fix, embeddings, config, lifecycle, revisions, bm25, search, wiki-log, cli) |
| `src/lib/__tests__/` | 13,503 | Test suite (1054 tests, 30 files) |
| `src/app/` | 3,074 | Pages (13) and API routes (18 files) |
| `src/components/` | 3,269 | React components (22) |
| `src/hooks/` | 961 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation) |

### Key modules

- **lint-checks.ts** (534 lines) — 7 lint checks extracted from lint.ts, each independently testable
- **embeddings.ts** (478 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **query.ts** (477 lines) — BM25 scoring, vector search, RRF fusion, LLM re-ranking, synthesis
- **ingest.ts** (441 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking
- **lint-fix.ts** (458 lines) — Auto-fix handlers for all 7 lint issue types
- **useGraphSimulation.ts** (451 lines) — Canvas-based force simulation hook for graph view
- **fetch.ts** (559 lines) — URL fetching with SSRF protection, Readability extraction
- **config.ts** (402 lines) — Settings persistence, provider resolution, env/config merging (sole `process.env` gateway)
- **wiki.ts** (379 lines) — Filesystem ops, index management, page cache
- **lifecycle.ts** (355 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **llm.ts** (327 lines) — Multi-provider LLM calls with retry/backoff, streaming support
- **cli.ts** (295 lines) — CLI parser and command dispatch

### Known tech debt

1. **Large component files** — `useGraphSimulation.ts` (451 lines), `GlobalSearch.tsx` (356 lines), `WikiIndexClient.tsx` (343 lines), and `BatchIngestForm.tsx` (317 lines) would benefit from decomposition.
2. **Untested modules** — Only 2 small modules lack dedicated test suites: `constants.ts` (93 lines — static values) and `types.ts` (85 lines — type-only, no runtime logic). Both are trivially low risk.
3. **Silent error swallowing** — Some catch blocks still discard errors. Improved significantly since session 18 (bare catch sweep) and session 29 (ENOENT noise cleanup), but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~43 | 2026-04-23 | Bug fixes (SCHEMA.md known gaps, raw 404 page, test noise), schema.ts extraction, status refresh |
| ~42 | 2026-04-23 | Fuzzy search (Levenshtein), image preservation during ingest, Docker deployment |
| ~41 | 2026-04-22 | Graph hook extraction (useGraphSimulation), config layer cleanup, status refresh |
| ~40 | 2026-04-22 | CLI `list`/`status` commands, embeddings env consolidation, lint decomposition |
| ~39 | 2026-04-21 | Contextual error hints, skip-nav + ARIA landmarks, error boundary sweep |

## 4. Tests Added (Since Last Report)

- 40 new tests (1014 → 1054) across sessions 41-43
- Notable coverage: fuzzy search (Levenshtein distance), image preservation, config consolidation, graph simulation hook

## 5. Decisions Made

- **CLI as a first-class interface** — Built `src/cli.ts` with all core operations (ingest, query, lint, list, status) so the wiki can be driven headless without the web server. This opens the door for scripting, CI pipelines, and terminal-first workflows.
- **Full `process.env` consolidation** — All environment variable reads now go through `config.ts` as the single gateway. This makes provider/model resolution predictable and testable without env manipulation in every test file.
- **Lint decomposition** — Extracted all 7 check functions from `lint.ts` into `lint-checks.ts` so the orchestrator is thin and each check is independently testable.
- **Error boundaries everywhere** — Every page now has a route-level error boundary with contextual hints instead of falling through to the global fallback.
- **Docker deployment** — Dockerfile, docker-compose, and DEPLOY.md provide a one-command `docker compose up` for self-hosting.

## 6. Blockers

- None. All core vision features are implemented. Test coverage is strong. CLI provides headless access. Docker deployment is ready.

## 7. Future Plan

The founding vision is complete. Focus shifts to component quality, new capabilities, and ecosystem.

### Priority 1 — Component decomposition
- [ ] Break up large components (`useGraphSimulation`, `GlobalSearch`, `WikiIndexClient`, `BatchIngestForm`)
- [ ] Extract shared form patterns (loading states, error display, submit handlers)

### Priority 2 — New capabilities
- [ ] Dataview-style dynamic queries from frontmatter
- [ ] Query re-ranking quality improvements
- [ ] Scheduled re-ingestion of URLs for freshness

### Priority 3 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] E2E/integration tests (Playwright or Cypress)

## 8. Metrics Snapshot

- **Total lines:** ~28,200 (lib: 6,813, tests: 13,503, pages+routes: 3,074, components: 3,269, hooks: 961)
- **Source files:** ~131
- **Test count:** 1054 (30 test files)
- **Route count:** 18 files
- **Pages:** 13
- **Components:** 22
- **Hooks:** 3
- **Open issues:** community-driven
- **Tech debt items:** 3 (large components, 2 untested small modules, error swallowing)

## 9. Recurring Reporting Template

The following template should be written to `.yoyo/status.md` every 5 sessions, replacing the previous report. Each report is a snapshot, not an append log — the journal serves as the running history.

---

### Template

```markdown
# Status Report

**Date:** YYYY-MM-DD
**Sessions completed:** N (since bootstrap YYYY-MM-DD)
**Build status:** ✅/❌ — N tests, N routes, N type errors

---

## What shipped (last 5 sessions)

| Session | Date | Summary |
|---------|------|---------|
| N | YYYY-MM-DD | One-line description |
| N-1 | ... | ... |
| N-2 | ... | ... |
| N-3 | ... | ... |
| N-4 | ... | ... |

## Tests added
- N new tests (total: N)
- Notable coverage: [areas newly covered]

## Decisions made
- [Key architectural or design decisions, with rationale]

## Blockers
- [Anything preventing progress, or "None"]

## Next 5 sessions — priorities
1. [Highest impact item]
2. ...
3. ...

## Metrics snapshot
- Total lines: N (lib: N, tests: N, pages: N, components: N)
- Test count: N
- Route count: N
- Open issues: N
- Tech debt items: N
```

---

*This report was generated at session ~43 (2026-04-23). Next report due at session ~48.*
