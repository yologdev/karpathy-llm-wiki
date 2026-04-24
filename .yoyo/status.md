# Status Report

**Date:** 2026-04-24  
**Sessions completed:** ~45 (bootstrap 2026-04-06 → current 2026-04-24)  
**Build status:** ✅ PASS — 1100 tests, 20 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image download & preservation, source URL tracking in frontmatter, re-ingest API for staleness detection, CLI `ingest` command |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history, CLI `query` command |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering, CLI `lint` command |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, dataview-style frontmatter queries, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, and began systematic component decomposition. Sessions 25–29 continued decomposition (hooks, components, lib modules), added configurable lint, and expanded test coverage. Sessions 30–35 focused on test backfill — writing dedicated test suites for every previously untested module. Session 35 also shipped a guided onboarding wizard and dark mode toggle. Sessions 36–40 pivoted to accessibility, mobile responsiveness, CLI tooling, and codebase consolidation — `process.env` bypasses eliminated, lint decomposed into focused modules, error boundaries on every page, and a fully wired CLI for headless operation. Sessions 41–43 continued polish — graph hook extraction, config consolidation, fuzzy search, image preservation during ingest, and Docker deployment (Dockerfile, docker-compose, DEPLOY.md). Sessions 44–45 shipped dataview-style frontmatter queries (library, API, and UI), a re-ingest endpoint for URL freshness checking, source URL tracking in frontmatter, and local image downloading during ingest.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
CLI:        src/cli.ts — ingest, query, lint, list, status subcommands
Testing:    Vitest (1100 tests across 31 test files)
```

### Codebase size (~30,100 lines across ~139 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 7,305 | Core logic (ingest, query, lint, lint-checks, lint-fix, embeddings, config, lifecycle, revisions, bm25, search, dataview, wiki-log, cli) |
| `src/lib/__tests__/` | 14,329 | Test suite (1100 tests, 31 files) |
| `src/app/` | 3,518 | Pages (13) and API routes (20 files) |
| `src/components/` | 3,675 | React components (24) |
| `src/hooks/` | 961 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation) |

### Key modules

- **fetch.ts** (710 lines) — URL fetching with SSRF protection, Readability extraction, image downloading
- **lint-checks.ts** (534 lines) — 7 lint checks extracted from lint.ts, each independently testable
- **ingest.ts** (490 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking, source URL tracking
- **embeddings.ts** (478 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **query.ts** (477 lines) — BM25 scoring, vector search, RRF fusion, LLM re-ranking, synthesis
- **search.ts** (465 lines) — Related pages, backlinks, content search, fuzzy matching
- **lint-fix.ts** (458 lines) — Auto-fix handlers for all 7 lint issue types
- **useGraphSimulation.ts** (451 lines) — Canvas-based force simulation hook for graph view
- **config.ts** (402 lines) — Settings persistence, provider resolution, env/config merging (sole `process.env` gateway)
- **wiki.ts** (385 lines) — Filesystem ops, index management, page cache
- **lifecycle.ts** (355 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **llm.ts** (327 lines) — Multi-provider LLM calls with retry/backoff, streaming support
- **cli.ts** (295 lines) — CLI parser and command dispatch
- **dataview.ts** (270 lines) — Frontmatter-based structured queries with filter/sort/limit

### Known tech debt

1. **Large component files** — `WikiIndexClient.tsx` (364 lines), `GlobalSearch.tsx` (356 lines), `DataviewPanel.tsx` (330 lines), and `BatchIngestForm.tsx` (317 lines) would benefit from decomposition.
2. **console.warn/error in lib code** — 31 instances across lib modules. Most are legitimate fallbacks (ENOENT, network errors), but some could be replaced with structured error returns or proper logging.
3. **Untested modules** — Only 2 small modules lack dedicated test suites: `constants.ts` (96 lines — static values) and `types.ts` (89 lines — type-only, no runtime logic). Both are trivially low risk.
4. **Silent error swallowing** — Some catch blocks still discard errors. Improved significantly since session 18 (bare catch sweep) and session 29 (ENOENT noise cleanup), but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~45 | 2026-04-24 | Dataview query UI on wiki index page, local image downloading during ingest |
| ~44 | 2026-04-24 | Dataview query library + API, re-ingest endpoint, source URL tracking in frontmatter |
| ~43 | 2026-04-23 | Schema.ts extraction, SCHEMA.md cleanup, raw 404 fix, test noise cleanup |
| ~42 | 2026-04-23 | Fuzzy search (Levenshtein), image preservation during ingest, Docker deployment |
| ~41 | 2026-04-22 | Graph hook extraction (useGraphSimulation), config layer cleanup, status refresh |

## 4. Tests Added (Since Last Report)

- 46 new tests (1054 → 1100) across sessions 44–45
- Notable coverage: dataview queries (filter/sort/limit), fetch module expansion (image downloading, URL safety), re-ingest flow

## 5. Decisions Made

- **Dataview queries over raw SQL** — Built a frontmatter-based query system (`src/lib/dataview.ts`) modeled on Obsidian Dataview. Users can filter and sort wiki pages by structured metadata (tags, dates, source) without needing a database layer. Keeps the local-filesystem-first architecture intact.
- **Re-ingest for freshness** — Added a `/api/ingest/reingest` endpoint that re-fetches a source URL and diffs against the original content. This closes the loop on the founding vision's "keep sources fresh" goal without requiring cron or scheduled jobs — users trigger it manually or via the UI.
- **Local image storage** — Images referenced in ingested content are now downloaded to `raw/images/` and rewritten as local paths. This makes the wiki self-contained and resilient to external image link rot.
- **Source URL tracking** — Ingest now stores the original URL in page frontmatter (`source_url`), enabling re-ingestion without requiring users to remember or re-enter URLs.

## 6. Blockers

- None. All core vision features are implemented. Test coverage is strong. CLI provides headless access. Docker deployment is ready.

## 7. Future Plan

The founding vision is complete. Focus shifts to component quality, new capabilities, and ecosystem.

### Priority 1 — Component decomposition
- [ ] Break up large components (`WikiIndexClient`, `GlobalSearch`, `DataviewPanel`, `BatchIngestForm`)
- [ ] Extract shared form patterns (loading states, error display, submit handlers)

### Priority 2 — New capabilities
- [ ] Query re-ranking quality improvements
- [ ] Structured logging to replace scattered console.warn/error
- [ ] Wiki page templates for consistent structure

### Priority 3 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] E2E/integration tests (Playwright or Cypress)

## 8. Metrics Snapshot

- **Total lines:** ~30,100 (lib: 7,305, tests: 14,329, pages+routes: 3,518, components: 3,675, hooks: 961)
- **Source files:** ~139
- **Test count:** 1100 (31 test files)
- **Route count:** 20 files
- **Pages:** 13
- **Components:** 24
- **Hooks:** 3
- **Open issues:** community-driven
- **Tech debt items:** 4 (large components, console.warn/error in lib, 2 untested small modules, error swallowing)

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

*This report was generated at session ~45 (2026-04-24). Next report due at session ~50.*
