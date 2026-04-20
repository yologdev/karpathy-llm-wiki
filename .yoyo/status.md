# Status Report

**Date:** 2026-04-20  
**Sessions completed:** ~36 (bootstrap 2026-04-06 → current 2026-04-20)  
**Build status:** ✅ PASS — 964 tests, 18 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, and began systematic component decomposition. Sessions 25–29 continued decomposition (hooks, components, lib modules), added configurable lint, and expanded test coverage. Sessions 30–35 focused on test backfill — writing dedicated test suites for every previously untested module. Session 35 also shipped a guided onboarding wizard and dark mode toggle. No major features remain unbuilt from the founding vision's core scope.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
Testing:    Vitest (964 tests across 28 test files)
```

### Codebase size (~26,400 lines across 115 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 6,300 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log) |
| `src/lib/__tests__/` | 12,800 | Test suite (964 tests, 28 files) |
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
- **wiki.ts** (370 lines) — Filesystem ops, index management, page cache
- **lifecycle.ts** (355 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **config.ts** (355 lines) — Settings persistence, provider resolution, env/config merging
- **llm.ts** (331 lines) — Multi-provider LLM calls with retry/backoff, streaming support

### Known tech debt

1. **`process.env` reads bypassing config** — Some modules still read environment variables directly instead of going through `config.ts`. Should consolidate all env access through the config layer.
2. **Untested modules** — Only 2 small modules lack dedicated test suites: `constants.ts` (83 lines — static values) and `types.ts` (85 lines — type-only, no runtime logic). Both are trivially low risk.
3. **Silent error swallowing** — Some catch blocks still discard errors. Improved significantly since session 18 (bare catch sweep) and session 29 (ENOENT noise cleanup), but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~36 | 2026-04-20 | SCHEMA.md refresh (added missing lint checks), status report update |
| ~35 | 2026-04-19 | Onboarding wizard (empty wiki detection + guided setup), dark mode toggle (localStorage + system preference), test suites for `wiki-log.ts`, `lock.ts`, `providers.ts` |
| ~34 | 2026-04-19 | Test backfill for `fetch.ts` (SSRF, Readability, URL validation) and `lifecycle.ts` (write/delete pipeline, side effects) |
| ~33 | 2026-04-18 | Test backfill for `search.ts`, `raw.ts`, `links.ts`, `citations.ts` |
| ~32 | 2026-04-18 | Status report refresh, dedicated test suites for `bm25.ts` and `frontmatter.ts` |

## 4. Tests Added (Since Last Report)

- 56 new tests (908 → 964)
- 3 new test files: `wiki-log.test.ts`, `lock.test.ts`, `providers.test.ts`
- Test file count: 25 → 28
- Notable coverage: File locking concurrency, provider metadata helpers, operation log append/read, plus continued hardening of existing suites

## 5. Decisions Made

- **Systematic test backfill as primary quality strategy** — Sessions 30–35 focused on writing dedicated test suites for every module that previously only had indirect coverage. This reduced untested modules from 7 to 2 (and the remaining 2 are trivially small: static constants and TypeScript types).
- **UX polish alongside testing** — Session 35 broke the pure-testing streak to ship onboarding wizard and dark mode, both high-impact UX improvements that were Priority 2 items.
- **SCHEMA.md accuracy as documentation priority** — Keeping the schema in sync with actual lint checks ensures future LLM sessions (which load SCHEMA.md into prompts) operate on correct assumptions.

## 6. Blockers

- None. All core vision features are implemented. Test coverage is strong.

## 7. Future Plan

The founding vision is complete. Focus shifts to remaining UX polish and ecosystem expansion.

### Priority 1 — UX polish
- [ ] Mobile-responsive layout improvements (desktop-first today, minimal breakpoints)
- [ ] Accessibility improvements (skip-nav, focus management, graph text alternatives)
- [ ] Contextual error messages in error boundaries (e.g., "Check your API key" for LLM failures)

### Priority 2 — Capability gaps
- [ ] CLI tool for headless ingest/query/lint operations
- [ ] Image/asset handling during ingest (currently dropped)
- [ ] Dataview-style dynamic queries from frontmatter

### Priority 3 — Ecosystem
- [ ] Obsidian plugin (export exists, real plugin doesn't)
- [ ] Multi-user / auth support
- [ ] Vector search for Anthropic-only users (Anthropic has no embedding API)
- [ ] E2E/integration tests (Playwright or Cypress)

## 8. Metrics Snapshot

- **Total lines:** ~26,400 (lib: 6,300, tests: 12,800, pages+routes: 3,670, components: 2,890, hooks: 510)
- **Source files:** 115
- **Test count:** 964 (28 test files)
- **Route count:** 18 files
- **Pages:** 13
- **Components:** 20
- **Hooks:** 2
- **Open issues:** community-driven
- **Tech debt items:** 3 (env bypass, 2 untested small modules, error swallowing)

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

*This report was generated at session ~36 (2026-04-20). Next report due at session ~41.*
