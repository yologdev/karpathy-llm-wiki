# Status Report

**Date:** 2026-04-26  
**Sessions completed:** ~49 (bootstrap 2026-04-06 → current 2026-04-26)  
**Build status:** ✅ PASS — 1121 tests, 20 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image download & preservation, source URL tracking in frontmatter, re-ingest API for staleness detection, CLI `ingest` command |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history, CLI `query` command |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering, CLI `lint` command |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, dataview-style frontmatter queries, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–29 added revision history, optimized query re-ranking, began systematic component decomposition, and expanded test coverage. Sessions 30–35 focused on test backfill and shipped a guided onboarding wizard and dark mode toggle. Sessions 36–40 pivoted to accessibility, mobile responsiveness, CLI tooling, and codebase consolidation. Sessions 41–45 shipped dataview-style frontmatter queries, Docker deployment, fuzzy search, image preservation, and re-ingest. Sessions 46–49 focused on code quality — typed catch blocks, structured logging, page type templates in SCHEMA.md, error boundaries on every page, loading skeletons, component decomposition, and accessibility aria-labels.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
CLI:        src/cli.ts — ingest, query, lint, list, status subcommands
Testing:    Vitest (1121 tests across 32 test files)
Logging:    Structured logger (src/lib/logger.ts) with configurable levels
```

### Codebase size (~30,750 lines across ~148 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 7,511 | Core logic (ingest, query, lint, lint-checks, lint-fix, embeddings, config, lifecycle, revisions, bm25, search, dataview, wiki-log, logger, schema) |
| `src/lib/__tests__/` | 14,551 | Test suite (1121 tests, 32 files) |
| `src/app/` | 3,653 | Pages (13) and API routes (20 files) |
| `src/components/` | 3,780 | React components (26) |
| `src/hooks/` | 961 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation) |

### Key modules

- **fetch.ts** (715 lines) — URL fetching with SSRF protection, Readability extraction, image downloading
- **lint-checks.ts** (535 lines) — 7 lint checks extracted from lint.ts, each independently testable
- **query.ts** (530 lines) — BM25 scoring, vector search, RRF fusion, LLM re-ranking, synthesis
- **ingest.ts** (490 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking, source URL tracking
- **embeddings.ts** (479 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **search.ts** (469 lines) — Related pages, backlinks, content search, fuzzy matching
- **lint-fix.ts** (458 lines) — Auto-fix handlers for all 7 lint issue types
- **useGraphSimulation.ts** (451 lines) — Canvas-based force simulation hook for graph view
- **config.ts** (403 lines) — Settings persistence, provider resolution, env/config merging (sole `process.env` gateway)
- **wiki.ts** (390 lines) — Filesystem ops, index management, page cache
- **lifecycle.ts** (358 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **llm.ts** (329 lines) — Multi-provider LLM calls with retry/backoff, streaming support
- **cli.ts** (295 lines) — CLI parser and command dispatch
- **dataview.ts** (270 lines) — Frontmatter-based structured queries with filter/sort/limit
- **schema.ts** (86 lines) — SCHEMA.md parser exposing page conventions and type templates
- **logger.ts** (75 lines) — Structured logger with tag-based filtering and configurable levels

### Known tech debt

1. **Large component files** — `GlobalSearch.tsx` (356 lines), `DataviewPanel.tsx` (330 lines), and `BatchIngestForm.tsx` (317 lines) would benefit from decomposition. `WikiIndexClient.tsx` was reduced from 364 → 198 lines in session ~48.
2. **Untested modules** — Only 2 small modules lack dedicated test suites: `constants.ts` (96 lines — static values) and `types.ts` (89 lines — type-only, no runtime logic). Both are trivially low risk.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~49 | 2026-04-26 | Status report refresh, metrics update |
| ~48 | 2026-04-26 | Error boundaries on every page, loading skeletons, WikiIndexClient decomposition (364→198 lines), WikiIndexToolbar + WikiPageCard extraction |
| ~47 | 2026-04-25 | Structured logger (`logger.ts`) wired across all lib modules, SCHEMA.md page type templates (concept/entity/topic/source-summary), `schema.ts` expansion |
| ~46 | 2026-04-25 | Typed catch blocks across codebase, accessibility aria-labels on all interactive elements, query re-ranking prompt tuning |
| ~45 | 2026-04-24 | Dataview query UI on wiki index page, local image downloading during ingest |

## 4. Tests Added (Since Last Report)

- 21 new tests (1100 → 1121) across sessions 46–49
- Notable coverage: logger module, schema template parsing, error boundary behavior, component decomposition validation

## 5. Decisions Made

- **Structured logging over console.warn/error** — Built `src/lib/logger.ts` with tag-based filtering and configurable log levels to replace the 31 scattered `console.warn`/`console.error` calls across lib modules. Only one console reference remains (a comment in `logger.ts` describing the module's purpose). This gives us grep-friendly structured output and the ability to silence noisy subsystems during tests.
- **Page type templates in SCHEMA.md** — Added concrete templates (concept, entity, topic, source-summary) to SCHEMA.md so the ingest LLM gets structural guidance instead of vague conventions. Exposed via `schema.ts` so lint and query prompts can also reference them.
- **Typed catch blocks** — Swept all bare `catch (e)` blocks to use typed error guards (`if (e instanceof Error)`) so unknown exceptions get narrowed safely. Combined with the structured logger, this resolves the "silent error swallowing" tech debt item.
- **Component decomposition continues** — `WikiIndexClient.tsx` decomposed from 364 → 198 lines by extracting `WikiIndexToolbar` and `WikiPageCard`. The pattern of extracting sub-components into their own files continues to pay dividends in readability and testability.

## 6. Blockers

- None. All core vision features are implemented. Test coverage is strong. CLI provides headless access. Docker deployment is ready.

## 7. Future Plan

The founding vision is complete. Focus shifts to component quality, new capabilities, and ecosystem.

### Priority 1 — Component decomposition
- [ ] Break up remaining large components (`GlobalSearch`, `DataviewPanel`, `BatchIngestForm`)
- [ ] Extract shared form patterns (loading states, error display, submit handlers)

### Priority 2 — New capabilities
- [ ] Query re-ranking quality improvements
- [x] ~~Structured logging to replace scattered console.warn/error~~ (done, session ~47)
- [x] ~~Wiki page templates for consistent structure~~ (done, session ~47)

### Priority 3 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] E2E/integration tests (Playwright or Cypress)

## 8. Metrics Snapshot

- **Total lines:** ~30,750 (lib: 7,511, tests: 14,551, pages+routes: 3,653, components: 3,780, hooks: 961)
- **Source files:** ~148
- **Test count:** 1121 (32 test files)
- **Route count:** 20 files
- **Pages:** 13
- **Components:** 26
- **Hooks:** 3
- **Open issues:** community-driven
- **Tech debt items:** 2 (large components, 2 untested small modules)

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

*This report was generated at session ~49 (2026-04-26). Next report due at session ~54.*
