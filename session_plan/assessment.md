# Assessment — 2026-04-18

## Build Status
✅ **PASS** — `pnpm build` succeeds (18 routes, 13 pages), `pnpm lint` clean, `pnpm test` passes all 724 tests across 19 test files. No type errors. Minor expected ENOENT stderr noise in config/query-history tests (fresh install, no config file) — cosmetic only.

## Project State
All four founding vision pillars are fully implemented and functional:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, SSRF protection
- **Query** — BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history
- **Lint** — 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering
- **Browse** — Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export

Additional infrastructure: multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), settings page with provider/embedding config, YAML frontmatter on pages, file locking, page cache, SCHEMA.md co-evolution.

## Recent Changes (last 3 sessions)
1. **Session ~30 (2026-04-18 03:16)** — Dedicated test suites for `bm25.ts` and `frontmatter.ts`, status report refresh. Pure test coverage backfill.
2. **Session ~29 (2026-04-17 13:46)** — ENOENT noise cleanup, `useSettings` hook extraction from settings page, lint page decomposition (`LintFilterControls`, `LintIssueCard`).
3. **Session ~28 (2026-04-17 03:28)** — Wiki index sort/filter/date-range, `useStreamingQuery` hook extraction, configurable lint options (per-check enable/disable, severity filtering).

**Trajectory:** The last ~10 sessions have been pure refactoring, decomposition, and test backfill. No new features since revision history (session ~24). The codebase is in a mature stabilization phase.

## Source Architecture

### Line counts by layer (~23,200 total)
| Layer | Lines | Files |
|-------|------:|------:|
| `src/lib/` | 6,190 | 22 modules |
| `src/lib/__tests__/` | 9,950 | 19 test files |
| `src/app/` (pages + routes) | 3,670 | 31 files |
| `src/components/` | 2,890 | 20 components |
| `src/hooks/` | 510 | 2 hooks |

### Largest source files
| File | Lines | Role |
|------|------:|------|
| `lint.ts` | 625 | 7 lint checks |
| `embeddings.ts` | 472 | Vector store, cosine similarity |
| `query.ts` | 462 | BM25 + vector + RRF fusion + LLM |
| `ingest.ts` | 461 | URL fetch → LLM page generation |
| `lint-fix.ts` | 458 | Auto-fix for all 7 lint types |
| `fetch.ts` | 403 | URL fetching + SSRF protection |
| `wiki.ts` | 370 | Filesystem ops, index, page cache |
| `lifecycle.ts` | 355 | Write/delete pipeline |
| `config.ts` | 355 | Settings persistence, provider resolution |
| `graph/page.tsx` | 485 | Graph view (still largest page component) |

### Test coverage gaps
Modules **with** dedicated test suites (19): wiki, ingest, lint, query, embeddings, lint-fix, llm, config, bm25, frontmatter, graph, graph-render, format, errors, export, slugify, smoke, query-history, revisions.

Modules **without** dedicated tests: `fetch.ts` (403 lines), `lifecycle.ts` (355 lines), `search.ts` (265 lines), `raw.ts` (125 lines), `links.ts` (44 lines), `citations.ts` (22 lines), `wiki-log.ts` (87 lines), `lock.ts` (61 lines).

## Open Issues Summary
No open GitHub issues (`gh issue list` returns `[]`).

## Gaps & Opportunities

### Relative to founding vision (llm-wiki.md)
The core pattern is fully implemented. Remaining gaps from the vision doc:
1. **Image/asset handling** — llm-wiki.md mentions downloading images locally and having the LLM view them. Currently images are dropped during ingest.
2. **Marp slide deck generation** — Vision mentions answers in different formats including slide decks. Not implemented.
3. **Chart/canvas output** — Vision mentions matplotlib charts as query output format. Not implemented.
4. **CLI tool** — Vision emphasizes CLI usage alongside Obsidian. No CLI exists.

### Relative to YOYO.md direction
1. **CLI tool for headless operations** — Listed as Priority 3 in status.md.
2. **Dark mode consistency** — Listed as Priority 2 UX polish item.
3. **Mobile-responsive layout** — Listed as Priority 2 UX polish item.
4. **Guided onboarding** — No first-run experience for new users.
5. **Obsidian plugin** — Export exists but no real plugin.
6. **Multi-user / auth** — Open question in YOYO.md, unstarted.

### Code quality opportunities
1. **5 modules lack test suites** — `fetch.ts` (403 lines), `lifecycle.ts` (355 lines), `search.ts` (265 lines), `raw.ts` (125 lines), `links.ts` (44 lines) are the biggest untested modules. Combined 1,192 lines of untested core logic.
2. **`process.env` bypassing config** — 13 direct `process.env` reads in `embeddings.ts`, `llm.ts`, and `wiki.ts` that should go through `config.ts`. Known tech debt item from status report.
3. **Bare catch blocks** — 4 remaining bare `catch {}` blocks in `revisions.ts` (3) and `wiki.ts` (1) that swallow errors silently.
4. **graph/page.tsx at 485 lines** — Largest page component, still not decomposed despite other pages being broken up.
5. **No component tests** — All 724 tests are library-level. Zero tests for React components or hooks. The 20 components and 2 hooks are untested.
6. **No E2E or integration tests** — No tests exercise the API routes or page rendering.

## Bugs / Friction Found

### From code review
1. **Bare catch blocks in revisions.ts** — Lines 75, ~130, ~137 use `catch {}` without logging. If `deleteRevisions` or `listRevisions` fails, errors are silently swallowed with no diagnostic output.
2. **Bare catch in wiki.ts** — Line 206 uses `catch {}`. Same silent swallowing pattern.
3. **`lock.ts` swallows errors** — Line 50: `locks.set(key, next.catch(() => {}))` — intentional but could mask lock contention issues in debug scenarios.
4. **13 `process.env` reads bypassing config layer** — `embeddings.ts` (8 reads), `llm.ts` (5 reads), `wiki.ts` (2 reads) all reach for env vars directly. Users who configure providers through the Settings UI may find embeddings/wiki dirs not reflecting their choices.

### From build output
- No build warnings or errors. Clean build.
- Test stderr shows expected ENOENT messages from config tests (config file doesn't exist in temp dirs) — cosmetic noise, not bugs.

### Friction for new contributors
- No `CONTRIBUTING.md` or development setup guide.
- No documented way to run a single test file or debug a specific module.
- `README.md` exists but unclear if it's current with the actual feature set.
