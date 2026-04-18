# Status Report

**Date:** 2026-04-18  
**Sessions completed:** ~29 (bootstrap 2026-04-06 → current 2026-04-18)  
**Build status:** ✅ PASS — 724 tests, 18 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, and began systematic component decomposition. Sessions 25–29 continued decomposition (hooks, components, lib modules), added configurable lint, and expanded test coverage with dedicated test files for previously untested modules. No major features remain unbuilt from the founding vision's core scope.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
Testing:    Vitest (724 tests across 19 test files)
```

### Codebase size (~23,200 lines across 109 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 6,190 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log) |
| `src/lib/__tests__/` | 9,950 | Test suite (724 tests, 19 files) |
| `src/app/` | 3,670 | Pages (13) and API routes (18 files) |
| `src/components/` | 2,890 | React components (20) |
| `src/hooks/` | 510 | Custom hooks (useSettings, useStreamingQuery) |

### Key modules

- **lint.ts** (625 lines) — 7 lint checks with configurable enable/disable and severity filtering
- **embeddings.ts** (472 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **query.ts** (462 lines) — BM25 scoring, vector search, RRF fusion, LLM re-ranking, synthesis
- **ingest.ts** (461 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking
- **lint-fix.ts** (458 lines) — Auto-fix handlers for all 7 lint issue types
- **fetch.ts** (403 lines) — URL fetching with SSRF protection, Readability extraction
- **wiki.ts** (370 lines) — Filesystem ops, index management, page cache (slimmed after wiki-log + search extraction)
- **lifecycle.ts** (355 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **config.ts** (355 lines) — Settings persistence, provider resolution, env/config merging
- **llm.ts** (331 lines) — Multi-provider LLM calls with retry/backoff, streaming support

### Known tech debt

1. **`process.env` reads bypassing config** — Some modules still read environment variables directly instead of going through `config.ts`. Should consolidate all env access through the config layer.
2. **Untested modules** — `fetch.ts`, `lifecycle.ts`, `search.ts`, `raw.ts`, and `links.ts` lack dedicated test suites. They get exercised indirectly through integration-style tests, but have no focused unit tests.
3. **Silent error swallowing** — Some catch blocks still discard errors. Improved significantly since session 18 (bare catch sweep) and session 29 (ENOENT noise cleanup), but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~29 | 2026-04-17 | ENOENT noise cleanup, `useSettings` hook extraction, lint page decomposition (`LintFilterControls`, `LintIssueCard`) |
| ~28 | 2026-04-17 | Wiki index sort/filter/date-range, `useStreamingQuery` hook extraction, configurable lint (per-check enable/disable, severity filtering) |
| ~27 | 2026-04-16 | Copy-as-markdown on query results, `QueryHistorySidebar` extraction, `wiki-log.ts` split from wiki.ts |
| ~26 | 2026-04-16 | Table-format queries, `graph-render.ts` split from graph page, `bm25.ts` extraction from query.ts |
| ~25 | 2026-04-15 | Structured lint `target` field, `search.ts` extraction from wiki.ts |

## 4. Tests Added (Since Last Report)

- 108 new tests (616 → 724)
- 3 new test files: `graph-render.test.ts`, `bm25.test.ts`, `frontmatter.test.ts`
- Notable coverage: BM25 tokenization/scoring/corpus stats, frontmatter parsing/serialization edge cases, graph force-simulation helpers and color palettes, plus expanded tests across existing suites from module decomposition

## 5. Decisions Made

- **Component decomposition as primary code quality strategy** — Sessions 25–29 systematically broke large page components into focused sub-components (`LintFilterControls`, `LintIssueCard`, `QueryHistorySidebar`, `BatchIngestForm`, `IngestPreview`, `IngestSuccess`).
- **Hook extraction pattern for shared state logic** — Extracted `useSettings` (provider/embedding state) and `useStreamingQuery` (SSE fetch/parse) as reusable hooks, separating state management from UI rendering.
- **Configurable lint with per-check control** — Users can selectively enable/disable individual lint checks and filter by severity, so large wikis don't have to run every check every time.
- **Module extraction over rewriting** — wiki.ts shrank from 440 → 370 lines by extracting `wiki-log.ts` and `search.ts` rather than rewriting; `query.ts` slimmed by extracting `bm25.ts`; graph page slimmed by extracting `graph-render.ts`.

## 6. Blockers

- None. All core vision features are implemented.

## 7. Future Plan

The founding vision is complete. Focus shifts to test coverage, UX polish, and ecosystem expansion.

### Priority 1 — Test coverage for untested modules
- [ ] `fetch.ts` — URL fetching, SSRF protection, Readability extraction
- [ ] `lifecycle.ts` — Write/delete pipeline side effects
- [ ] `search.ts` — Related pages, backlinks, content search
- [ ] `raw.ts` — Raw source persistence
- [ ] `links.ts` — Wiki link extraction

### Priority 2 — UX polish
- [ ] Dark mode consistency across all components
- [ ] Guided first-ingest onboarding walkthrough
- [ ] Mobile-responsive layout improvements

### Priority 3 — Capability gaps
- [ ] CLI tool for headless ingest/query/lint operations
- [ ] Image/asset handling during ingest (currently dropped)
- [ ] Dataview-style dynamic queries from frontmatter

### Priority 4 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] Vector search for Anthropic-only users (Anthropic has no embedding API)

## 8. Metrics Snapshot

- **Total lines:** 23,200 (lib: 6,190, tests: 9,950, pages+routes: 3,670, components: 2,890, hooks: 510)
- **Source files:** 109
- **Test count:** 724 (19 test files)
- **Route count:** 18 files
- **Pages:** 13
- **Components:** 20
- **Hooks:** 2
- **Open issues:** community-driven
- **Tech debt items:** 3 (env bypass, untested modules, error swallowing)

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

*This report was generated at session ~29 (2026-04-18). Next report due at session ~34.*
