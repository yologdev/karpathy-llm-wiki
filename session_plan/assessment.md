# Assessment — 2026-04-13

## Build Status

✅ **ALL PASS** — `pnpm build` (28 routes), `pnpm lint` (0 warnings), `pnpm test` (573 tests across 12 test files, 0 failures)

## Project State

The project is a fully functional Next.js 15 web application implementing all four pillars of the LLM Wiki founding vision. Total codebase: ~19,700 lines across 67 source files (4,960 lib, 8,370 tests, 3,680 pages/routes, 1,470 components).

### Implemented Features

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, SSRF protection, raw source persistence |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, citation extraction, save-answer-to-wiki, query history |
| **Lint** | ✅ Complete | 7 check types (orphan, stale-index, empty, missing-cross-ref, contradiction, missing-concept-page, broken-link), auto-fix for all, LLM-powered contradiction detection |
| **Browse** | ✅ Complete | Wiki index with search/filter, page view with backlinks, edit/delete/create, interactive D3 graph (HiDPI, accessible), log viewer, raw source browser, global search, Obsidian export |

### Cross-cutting

- Multi-provider LLM support (Anthropic, OpenAI, Google, Ollama) via Vercel AI SDK
- Browser-based settings UI with config persistence (JSON config file)
- Provider-agnostic embedding layer with local JSON vector store
- File locking for concurrent operations
- Error boundaries on all routes
- Mobile-responsive nav with hamburger menu
- Dark/light theme support
- Schema-aware LLM prompts (loads SCHEMA.md at runtime)

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| 22 | 2026-04-13 02:01 | HiDPI graph fix (canvas DPR scaling), cross-ref false positive fix (partial slug matching), 3 embeddings data-integrity fixes (atomic writes, model-mismatch detection, text truncation) |
| 21 | 2026-04-12 20:28 | Delete ENOENT crash fix, lifecycle TOCTOU race fix, accessibility attributes, lint page cache, GlobalSearch dedup |
| 20 | 2026-04-12 16:30 | Link dedup into shared `links.ts`, retry false-positive fix (`isRetryableError` matching LLM content), SSRF redirect-bypass hardening, streaming body size check |

**Trend:** Last ~10 sessions have been hardening, bug-fixing, and reliability improvements — no major new features. The journal repeatedly notes "next: graph clustering, or query re-ranking" but neither has been tackled.

## Source Architecture

### Library Layer (`src/lib/` — 4,960 lines)

| File | Lines | Responsibility |
|------|------:|---------------|
| ingest.ts | 850 | URL fetch, SSRF, HTML cleanup, chunking, LLM page generation |
| wiki.ts | 656 | Page I/O, cache, index management, logging, cross-refs, backlinks, search |
| lint.ts | 571 | 7 lint check types, LLM-powered contradiction + concept detection |
| query.ts | 545 | BM25 scoring, RRF fusion, context building, LLM querying, save-to-wiki |
| embeddings.ts | 472 | Vector store, embedding model resolution, cosine similarity, rebuild |
| lint-fix.ts | 452 | Auto-fix handlers for all 7 lint issue types |
| config.ts | 355 | Settings persistence, env var resolution, credential management |
| lifecycle.ts | 341 | Unified write/delete pipeline (index, log, embeddings, cross-refs) |
| llm.ts | 330 | Provider-agnostic LLM calls, retry with backoff, streaming |
| frontmatter.ts | 267 | YAML frontmatter parse/serialize |
| query-history.ts | 129 | Query history persistence |
| raw.ts | 125 | Raw source file I/O |
| constants.ts | 83 | Centralized magic numbers |
| types.ts | 74 | Shared TypeScript interfaces |
| lock.ts | 61 | File-level write locking |
| providers.ts | 46 | Provider constants and labels |
| links.ts | 44 | Wiki link extraction and matching |
| export.ts | 27 | Obsidian link conversion |
| citations.ts | 21 | Citation slug extraction |
| slugify.ts | 18 | Slug generation |

### Test Layer (`src/lib/__tests__/` — 8,370 lines)

| Test File | Lines | Tests |
|-----------|------:|------:|
| wiki.test.ts | 1,903 | ~150+ |
| ingest.test.ts | 1,610 | ~100+ |
| embeddings.test.ts | 1,078 | ~70+ |
| lint.test.ts | 1,014 | ~70+ |
| query.test.ts | 1,009 | ~70+ |
| lint-fix.test.ts | 656 | ~40+ |
| llm.test.ts | 432 | ~30+ |
| config.test.ts | 334 | ~25+ |
| query-history.test.ts | 202 | ~10 |
| export.test.ts | 65 | 9 |
| slugify.test.ts | 50 | 8 |
| smoke.test.ts | 18 | 2 |

### Page Layer (`src/app/` — 3,680 lines, 28 routes)

Largest pages: settings (616), ingest (516), query (507), graph (464), lint (348)

### Component Layer (`src/components/` — 1,470 lines, 9 components)

Largest: GlobalSearch (346), BatchIngestForm (316), WikiIndexClient (249), NavHeader (215)

## Open Issues Summary

**No open issues.** The `gh issue list` returned an empty array. Community direction is currently undefined — the project is growing based on the founding vision alone.

## Gaps & Opportunities

### vs. Founding Vision (`llm-wiki.md`)

1. **Image/asset handling** — The vision mentions downloading images locally and LLM image viewing. Currently not implemented at all — images in source content are dropped during ingest.
2. **Output format variety** — The vision mentions "a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas." Query only produces markdown text.
3. **Dataview-style queries** — The vision mentions Obsidian Dataview for dynamic queries from frontmatter. Not implemented.
4. **CLI tool** — The vision emphasizes CLI usage (`grep`, unix tools on log.md). No CLI interface exists — only the web app.
5. **Obsidian plugin** — Export to Obsidian vault exists, but no actual Obsidian plugin for real-time integration.

### vs. YOYO.md Direction

6. **Graph view clustering** — Repeatedly noted as "next" for ~10 sessions but never built. The graph becomes hard to navigate at scale.
7. **Query re-ranking** — Also repeatedly noted as "next." Current BM25 + optional vector search could benefit from LLM re-ranking of candidate pages.

### Architectural Gaps

8. **`lifecycle.ts` has zero test coverage** — The most critical module (unified write pipeline) has no dedicated tests. All other core modules have thorough tests.
9. **No component/page tests** — 9 components and 15+ pages with zero component-level testing. All UI is untested.
10. **`ingest.ts` at 850 lines** — Mixes 4 distinct responsibilities (URL fetching/SSRF, text chunking, summary extraction, ingest pipeline). Should be decomposed.

### Performance

11. **Redundant disk reads per query** — `searchIndex` calls `buildCorpusStats` (reads all pages) + `listWikiPages` (reads all pages again). Two full scans per query.
12. **`findBacklinks` reads every page without cache** — Doesn't use `withPageCache`, unlike lint.

## Bugs / Friction Found

### From Code Review

1. **`postIndexEntries` non-null assertion fragility** (`lifecycle.ts:238,247`) — Variable assigned inside async callback, used outside with `!`. Works today but fragile if `withFileLock` semantics change. **Severity: Low.**

2. **`findBacklinks` bypasses page cache** (`wiki.ts:518-534`) — Reads pages from disk directly, doesn't benefit from `withPageCache`. Every call reads all pages twice (once for `listWikiPages`, once for the content loop). **Severity: Medium at scale.**

3. **`searchWikiContent` does raw `fs.readFile` bypassing `readWikiPage`** (`wiki.ts:566-644`) — Skips slug validation and page cache. **Severity: Low.**

4. **Non-greedy JSON array regex** (`wiki.ts:437`, `query.ts:319`) — `[\s\S]*?` will match the shortest `[…]` substring, potentially truncating nested arrays. LLM is prompted for flat arrays so unlikely to trigger. **Severity: Low.**

5. **Duplicated provider detection in embeddings** (`embeddings.ts:61-88` vs `106-162`) — `getEmbeddingModelName()` and `getEmbeddingModel()` repeat ~40 lines of identical provider resolution logic. **Severity: Low (code smell).**

6. **Module-level mutable page cache singleton** (`wiki.ts:78`) — `let pageCache: Map | null = null` is shared across concurrent requests in serverless. The `withPageCache` guard mitigates this, but the design is inherently non-concurrent-safe if two requests overlap outside `withPageCache`. **Severity: Low.**

7. **Inconsistent error return patterns** — Some functions throw, some return `null`, some return `[]`. No consistent convention. **Severity: Low (readability/maintenance).**

### From Build Output

No build warnings. A few `stderr` messages in test output from expected ENOENT errors in query-history and smoke tests — harmless log noise from normal error path testing.
