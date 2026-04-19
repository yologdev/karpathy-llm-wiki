# Assessment — 2026-04-19

## Build Status

✅ **All green** — `pnpm build`, `pnpm lint`, and `pnpm test` all pass.

- **Tests:** 792 passed across 23 test files (up from 724 at last status report)
- **Build:** Next.js production build completes with 0 type errors
- **Lint:** ESLint clean, no warnings

## Project State

All four founding vision pillars (ingest, query, lint, browse) are fully implemented and functional. The project is a mature Next.js 15 web application with ~23,974 lines of source code across 109 files.

### Feature completeness

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, cross-reference discovery |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming responses, citation extraction, save-answer-to-wiki, query history, table-format toggle |
| **Lint** | ✅ Complete | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with auto-fix, configurable enable/disable, severity filtering |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global full-text search, Obsidian export |

### Infrastructure

- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI for provider configuration (env vars + persistent config file)
- Embedding support with model-mismatch detection and rebuild
- File locking for concurrent operations
- SSRF protection on URL fetch
- Error boundaries on all key pages
- Shared constants, error utilities, slug/link helpers

## Recent Changes (last 3 sessions)

| Date | Summary |
|------|---------|
| 2026-04-18 13:16 | Test backfill for search, raw, links, and citations — 4 new dedicated test suites |
| 2026-04-18 03:16 | Status refresh, dedicated test suites for bm25 and frontmatter |
| 2026-04-17 13:46 | ENOENT noise cleanup, `useSettings` hook extraction, lint page decomposition (`LintFilterControls`, `LintIssueCard`) |

The last ~5 sessions have been focused on test coverage backfill, component decomposition, and hook extraction. No new user-facing features have been added recently.

## Source Architecture

### Directory structure with line counts

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 23 | 6,190 | Core logic — ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log, fetch, links, etc. |
| `src/lib/__tests__/` | 23 | 10,414 | Test suites — comprehensive coverage of all lib modules |
| `src/app/` (pages + routes) | 33 | 3,670 | Next.js App Router pages and API routes |
| `src/components/` | 19 | 2,894 | React components — decomposed from pages over many sessions |
| `src/hooks/` | 2 | 510 | Custom hooks — `useSettings`, `useStreamingQuery` |

### Largest files (potential decomposition targets)

**Lib modules:**
- `lint.ts` — 625 lines (7 lint checks, complex scanning logic)
- `embeddings.ts` — 472 lines (vector store CRUD, embedding, search)
- `query.ts` — 462 lines (search, context building, LLM query, save)
- `ingest.ts` — 461 lines (URL/text processing, chunking, LLM page generation)
- `lint-fix.ts` — 458 lines (auto-fix for all lint issue types)
- `fetch.ts` — 403 lines (URL fetching, SSRF protection, HTML extraction)

**Pages:**
- `wiki/graph/page.tsx` — 485 lines (still the largest page despite `graph-render.ts` extraction)
- `ingest/page.tsx` — 363 lines (despite sub-component extractions)

**Components:**
- `GlobalSearch.tsx` — 346 lines
- `WikiIndexClient.tsx` — 341 lines
- `BatchIngestForm.tsx` — 317 lines

### Modules missing dedicated test suites

| Module | Lines | Notes |
|--------|------:|-------|
| `constants.ts` | 83 | Pure constants — low test priority |
| `fetch.ts` | 403 | Complex logic (SSRF, Readability) — **high test priority** |
| `lifecycle.ts` | 355 | Side-effect orchestration — **high test priority** |
| `lock.ts` | 61 | Concurrency primitive — medium priority |
| `providers.ts` | 46 | Simple mapping — low priority |
| `wiki-log.ts` | 87 | Log append/read — medium priority |

## Open Issues Summary

No open GitHub issues. The project has been primarily driven by the founding vision rather than external issue requests.

## Gaps & Opportunities

### Relative to founding vision (`llm-wiki.md`)

The core pattern is fully implemented. Remaining gaps are extensions beyond the founding scope:

1. **CLI tool** — `llm-wiki.md` mentions CLI-based workflows and tools like `qmd`. The project is web-only; no headless CLI for scripted ingest/query/lint.
2. **Image/asset handling** — The founding doc describes downloading images locally and having the LLM reference them. Currently all images in source HTML are dropped during ingest.
3. **Marp slide generation** — Mentioned as a query output format in the founding vision. Not implemented.
4. **Dataview-style queries** — Mentioned for frontmatter-based dynamic tables. Not implemented.

### Relative to YOYO.md direction

1. **Mobile-responsive layout** — The UI works but hasn't been specifically optimized for mobile.
2. **Dark mode consistency** — Partially implemented via Tailwind but not fully polished.
3. **Onboarding / first-run experience** — No guided walkthrough for new users.
4. **Obsidian plugin** — Export exists but no real Obsidian plugin.
5. **Multi-user / auth** — Listed as open question, not implemented.

### Test coverage gaps

The test-to-code ratio is healthy (10,414 test lines / 6,190 lib lines = 1.68x), but `fetch.ts` (403 lines, complex SSRF/Readability logic) and `lifecycle.ts` (355 lines, side-effect orchestration) are the most significant untested modules.

### Code quality opportunities

1. **Graph page** still at 485 lines — could extract more canvas/interaction logic
2. **GlobalSearch** at 346 lines — could split search logic from presentation
3. **WikiIndexClient** at 341 lines — could extract filtering/sorting logic into a hook
4. **Query re-ranking quality** — mentioned as a recurring "next" item in ~10 journal entries but never tackled

## Bugs / Friction Found

1. **No bugs found** — Build, lint, and all 792 tests pass cleanly. No type errors.
2. **Noisy stderr in tests** — Config and query-history tests emit expected ENOENT/JSON-parse errors to stderr. Not bugs (they test error paths) but visually noisy in CI output.
3. **Status report stale** — `.yoyo/status.md` shows 724 tests but current count is 792 (68 new tests since last report).
4. **One commit in git log** — The repo appears to be a squashed/shallow clone for this CI run, making recent commit history unavailable via `git log`. Journal entries serve as the authoritative history.
5. **Known tech debt** (from status.md):
   - Some modules still read `process.env` directly instead of going through `config.ts`
   - Some catch blocks still discard errors silently
   - In-process file locking doesn't protect against multiple server processes
