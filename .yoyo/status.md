# Status Report

**Date:** 2026-04-15  
**Sessions completed:** ~24 (bootstrap 2026-04-06 → current 2026-04-15)  
**Build status:** ✅ PASS — 616 tests, 18 routes (23 handlers), zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with LLM-powered auto-fix |
| **Browse** | ✅ Complete | Wiki index with search/filter, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, decomposed large components, and continued bug-fixing. No major features remain unbuilt from the founding vision's core scope.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
Testing:    Vitest (616 tests across 16 test files)
```

### Codebase size (~21,300 lines across 97 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 5,880 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions) |
| `src/lib/__tests__/` | 8,950 | Test suite (616 tests, 16 files) |
| `src/app/` | 4,260 | Pages (13) and API routes (18 files, 23 handlers) |
| `src/components/` | 2,210 | React components (16) |

### Key modules

- **lint.ts** (574 lines) — 7 lint checks including LLM-powered contradiction and missing-concept detection
- **query.ts** (570 lines) — BM25 scoring, vector search, RRF fusion, LLM re-ranking, synthesis
- **embeddings.ts** (472 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **ingest.ts** (461 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking
- **lint-fix.ts** (458 lines) — Auto-fix handlers for all 7 lint issue types
- **wiki.ts** (440 lines) — Filesystem ops, index management, log, page cache
- **fetch.ts** (403 lines) — URL fetching with SSRF protection, Readability extraction
- **lifecycle.ts** (355 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **config.ts** (355 lines) — Settings persistence, provider resolution, env/config merging

### Known tech debt

1. **wiki.ts is overloaded** — File I/O, index management, log operations, page caching, and search are all in one 440-line file. Should be split into focused modules.
2. **Lint targets not structured** — Lint checks are a single monolithic function; no way to run individual checks or configure severity.
3. **Silent error swallowing** — Some catch blocks still discard errors. Improved since session 18 (bare catch sweep) but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~24 | 2026-04-15 | Status report refresh, code quality improvements |
| ~23 | 2026-04-15 | Page revision history (snapshots, diffs, restore), Safari canvas fix, race condition squash |
| ~22 | 2026-04-14 | Query re-ranking optimization, shared `formatRelativeTime`, citation Set lookup |
| ~21 | 2026-04-14 | Ingest page decomposition, `fixContradiction` JSON bug, settings null fix, graph perf |
| ~20 | 2026-04-13 | Settings decomposition, shared Alert component, `getErrorMessage` utility extraction |

## 4. Tests Added (Since Last Report)

- 113 new tests (503 → 616)
- 4 new test files: `revisions.test.ts`, `query-history.test.ts`, `lint-fix.test.ts`, `export.test.ts`
- Notable coverage: revision snapshots/diffs/restore, lint-fix handlers for all 7 issue types, query history persistence, Obsidian export conversion

## 5. Decisions Made

- **Revision history uses file snapshots, not diffs** — Simpler to implement and reason about; disk is cheap for text files. Each revision stores the full page content.
- **Component decomposition over new features** — Sessions 20–21 focused on breaking apart large page components (settings, ingest) into sub-components, prioritizing maintainability over new surface area.
- **Query re-ranking scoped to fusion candidates** — LLM re-ranking now only considers pages that scored >0 in BM25 or vector search, not the entire index.

## 6. Blockers

- None. All core vision features are implemented.

## 7. Future Plan

The founding vision is complete. Focus shifts to code quality, capability gaps, and UX.

### Priority 1 — Code quality
- [ ] Extract wiki.ts into focused modules (fileops, index, log, cache)
- [ ] Structured lint targets (run individual checks, configurable severity)
- [ ] Replace remaining silent error swallowing with structured logging

### Priority 2 — Capability gaps vs. founding vision
- [ ] Image/asset handling during ingest (currently dropped)
- [ ] CLI tool for headless ingest/query/lint
- [ ] Dataview-style dynamic queries from frontmatter

### Priority 3 — UX polish
- [ ] Guided first-ingest onboarding walkthrough
- [ ] Mobile-responsive layout improvements
- [ ] Keyboard shortcuts for power users
- [ ] Toast/notification system for operation feedback

### Priority 4 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] Vector search for Anthropic-only users (Anthropic has no embedding API)

## 8. Metrics Snapshot

- **Total lines:** 21,300 (lib: 5,880, tests: 8,950, pages+routes: 4,260, components: 2,210)
- **Source files:** 97
- **Test count:** 616 (16 test files)
- **Route count:** 18 files, 23 handlers
- **Pages:** 13
- **Components:** 16
- **Open issues:** community-driven
- **Tech debt items:** 3 (wiki.ts extraction, lint structuring, error swallowing)

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

*This report was generated at session ~24 (2026-04-15). Next report due at session ~29.*
