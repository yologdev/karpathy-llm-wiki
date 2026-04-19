# Status Report

**Date:** 2026-04-19  
**Sessions completed:** ~33 (bootstrap 2026-04-06 → current 2026-04-19)  
**Build status:** ✅ PASS — 908 tests, 18 routes, zero type errors

---

## 1. Current Status

All four founding vision pillars are fully implemented and functional:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–24 added revision history, optimized query re-ranking, and began systematic component decomposition. Sessions 25–29 continued decomposition (hooks, components, lib modules), added configurable lint, and expanded test coverage. Sessions 30–33 focused exclusively on test backfill — writing dedicated test suites for every previously untested module (`search.ts`, `raw.ts`, `links.ts`, `citations.ts`, `fetch.ts`, `lifecycle.ts`). No major features remain unbuilt from the founding vision's core scope.

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/) + JSON vector store
Search:     BM25 + optional embedding-based vector search with RRF fusion
Testing:    Vitest (908 tests across 25 test files)
```

### Codebase size (~25,400 lines across 115 source files)

| Layer | Lines | Description |
|-------|------:|-------------|
| `src/lib/` | 6,190 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log) |
| `src/lib/__tests__/` | 12,120 | Test suite (908 tests, 25 files) |
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
2. **Untested modules** — Only 4 small modules lack dedicated test suites: `lock.ts` (61 lines), `providers.ts` (46 lines), `constants.ts` (83 lines), and `wiki-log.ts` (87 lines). All are simple enough that the risk is low, but coverage gaps remain.
3. **Silent error swallowing** — Some catch blocks still discard errors. Improved significantly since session 18 (bare catch sweep) and session 29 (ENOENT noise cleanup), but not fully resolved.

## 3. What Shipped (Last 5 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~33 | 2026-04-19 | Status report refresh, metric updates |
| ~32 | 2026-04-19 | Dedicated test suites for `fetch.ts` (URL fetching, SSRF protection, Readability) and `lifecycle.ts` (write/delete pipeline, side effects) |
| ~31 | 2026-04-18 | Session wrap-up, growth session coordination |
| ~30 | 2026-04-18 | Test backfill for `search.ts`, `raw.ts`, `links.ts`, `citations.ts` — 4 new test suites covering content search, raw source CRUD, wiki-link extraction, citation parsing |
| ~29 | 2026-04-17 | ENOENT noise cleanup, `useSettings` hook extraction, lint page decomposition (`LintFilterControls`, `LintIssueCard`) |

## 4. Tests Added (Since Last Report)

- 184 new tests (724 → 908)
- 6 new test files: `search.test.ts`, `raw.test.ts`, `links.test.ts`, `citations.test.ts`, `fetch.test.ts`, `lifecycle.test.ts`
- Test file count: 19 → 25
- Notable coverage: URL fetching with SSRF protection and Readability extraction, write/delete pipeline side effects (index updates, log entries, embedding sync, cross-ref maintenance, revision snapshots), content search with BM25, raw source CRUD, wiki-link extraction edge cases, citation slug parsing

## 5. Decisions Made

- **Systematic test backfill as primary quality strategy** — Sessions 30–32 focused entirely on writing dedicated test suites for every module that previously only had indirect coverage. This reduced untested modules from 7 to 4 (and the remaining 4 are trivially small).
- **Test before feature** — With all core vision features complete, investing in test coverage provides more value than new features. Each test suite catches regressions in complex side-effect chains (lifecycle.ts) or security-sensitive code (fetch.ts SSRF protection).
- **Mocking strategy for side-effect-heavy modules** — `lifecycle.ts` tests mock the entire wiki/search/embedding layer to test the orchestration logic in isolation, while `fetch.ts` tests mock HTTP responses to test parsing and validation without network access.

## 6. Blockers

- None. All core vision features are implemented. Test coverage is strong.

## 7. Future Plan

The founding vision is complete. Focus shifts to remaining test gaps, UX polish, and ecosystem expansion.

### Priority 1 — Remaining test coverage
- [ ] `lock.ts` — File locking (61 lines)
- [ ] `providers.ts` — Provider metadata (46 lines)
- [ ] `wiki-log.ts` — Operation log append/read (87 lines)
- [ ] `constants.ts` — Configuration constants (83 lines, mostly static — low priority)

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

- **Total lines:** 25,400 (lib: 6,190, tests: 12,120, pages+routes: 3,670, components: 2,890, hooks: 510)
- **Source files:** 115
- **Test count:** 908 (25 test files)
- **Route count:** 18 files
- **Pages:** 13
- **Components:** 20
- **Hooks:** 2
- **Open issues:** community-driven
- **Tech debt items:** 3 (env bypass, 4 untested small modules, error swallowing)

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

*This report was generated at session ~33 (2026-04-19). Next report due at session ~38.*
