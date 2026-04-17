# Assessment — 2026-04-17

## Build Status
✅ **ALL PASS** — `pnpm build` clean, `pnpm lint` clean, `pnpm test` 636 tests across 17 test files, zero failures. Build output has 3 benign ENOENT warnings for missing wiki/index.md and wiki/log.md (expected — no wiki content in repo, those dirs are gitignored).

## Project State
The app is a fully functional LLM Wiki web application implementing all four founding vision pillars:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview, raw source persistence, cross-ref update |
| **Query** | ✅ | BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming responses, table format toggle, cited answers, save-to-wiki loop, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, missing-crossref, broken-link, contradiction, missing-concept-page), all with auto-fix, configurable check types + severity filter |
| **Browse** | ✅ | Wiki index with sort/filter, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Supporting infrastructure:** Multi-provider LLM (Anthropic, OpenAI, Google, Ollama via Vercel AI SDK), settings UI with config persistence, SSRF protection, file locking, page caching, error boundaries on all routes.

## Recent Changes (last 3 sessions)
From journal entries (most recent first):

1. **2026-04-17 03:28** — Wiki index filtering (sort controls, date-range filtering), extracted `useStreamingQuery` hook from the 508-line query page, configurable lint options (enable/disable checks, filter by severity).
2. **2026-04-16 14:03** — Copy-as-markdown button for query results, extracted `QueryHistorySidebar` component, split `wiki-log.ts` out of `wiki.ts`.
3. **2026-04-16 03:32** — Table-format queries toggle, extracted `graph-render.ts` from graph page, extracted `bm25.ts` from query.ts.

**Pattern:** Recent sessions are focused on component/module decomposition and UX refinements rather than new features. The founding vision's core scope is complete.

## Source Architecture

**104 source files, ~22,275 total lines**

### Core library (`src/lib/` — 24 modules, 6,172 lines)
| File | Lines | Purpose |
|------|------:|---------|
| lint.ts | 625 | 7 lint checks with LLM-powered contradiction + concept detection |
| embeddings.ts | 472 | Vector store, embedding providers, cosine similarity, rebuild |
| query.ts | 462 | BM25+vector fusion, context building, LLM query, save-to-wiki |
| ingest.ts | 461 | URL/text ingest, chunking, LLM summarization, cross-ref pass |
| lint-fix.ts | 458 | Auto-fix handlers for all 7 lint issue types |
| fetch.ts | 403 | URL fetching, HTML stripping, Readability, SSRF protection |
| wiki.ts | 367 | Filesystem CRUD, index management, page caching |
| lifecycle.ts | 355 | Write/delete with side effects (index, log, cross-refs, embeddings) |
| config.ts | 355 | Settings persistence, provider resolution, env/config merging |
| llm.ts | 331 | Multi-provider LLM calls, retry with backoff, streaming |
| frontmatter.ts | 267 | YAML frontmatter parse/serialize |
| search.ts | 265 | Related pages, backlinks, content search |
| bm25.ts | 166 | BM25 scoring, corpus stats |
| graph-render.ts | 147 | Force simulation, canvas rendering helpers |
| revisions.ts | 140 | Page revision snapshots |
| query-history.ts | 129 | Query history persistence |
| raw.ts | 125 | Raw source CRUD |
| graph.ts | 102 | Community detection (label propagation) |
| *8 small modules* | ~430 | types, constants, providers, links, citations, errors, export, slugify, format, lock, wiki-log |

### Tests (`src/lib/__tests__/` — 17 files, 9,212 lines)
Heavy coverage on wiki.ts (1,924), ingest.ts (1,610), lint.ts (1,176), query.ts (1,150), embeddings.ts (1,078), lint-fix.ts (674). 636 passing tests.

### Pages & API routes (`src/app/` — 38 files, ~3,800 lines)
- 16 API route handlers across 14 route files
- 14 page components (ingest, query, lint, settings, wiki index/detail/edit/new/graph/log, raw index/detail, home)
- 5 error boundary pages

**Largest pages still:** lint/page.tsx (492), wiki/graph/page.tsx (485), settings/page.tsx (402), ingest/page.tsx (363)

### Components (`src/components/` — 17 files, 2,641 lines)
Largest: GlobalSearch (346), WikiIndexClient (341), BatchIngestForm (317), QueryResultPanel (241), RevisionHistory (227), NavHeader (215), ProviderForm (210)

### Hooks (`src/hooks/` — 1 file, 189 lines)
`useStreamingQuery.ts` — extracted from query page last session.

## Open Issues Summary
**No open issues** — `gh issue list` returned empty. The project has no community-filed feature requests or bug reports currently queued.

## Gaps & Opportunities

### vs. Founding Vision (llm-wiki.md)
1. **Image/asset handling** — Vision mentions downloading images locally and having LLM view them. Currently images in ingested content are dropped entirely. No asset pipeline.
2. **CLI tool** — Vision suggests CLI tools for search and operations. The app is web-only; no headless ingest/query/lint.
3. **Marp slide deck output** — Vision mentions generating presentations from wiki content. Not implemented.
4. **Dataview-style queries** — Vision mentions dynamic tables from frontmatter. YAML frontmatter exists but no query engine over it.
5. **Schema co-evolution** — Vision says "You and the LLM co-evolve [the schema] over time." SCHEMA.md exists and is loaded into ingest prompts, but there's no UI for editing it or mechanism for the LLM to propose schema changes.
6. **Canvas output** — Vision mentions canvas as a query output format. Not implemented.

### vs. YOYO.md Roadmap
1. **Obsidian plugin** — Export exists, real plugin doesn't.
2. **Multi-user / auth** — Not started.
3. **Vector search for Anthropic-only users** — Anthropic has no embedding API; most common deployment has no vector search.
4. **Toast/notification system** — Not implemented.
5. **Real-time preview during ingest** — Ingest has a preview step but not live streaming of LLM output during processing.
6. **Guided first-ingest onboarding** — Empty state has links but no walkthrough.

### Code Quality Opportunities
1. **Large page components** — lint/page.tsx (492), graph/page.tsx (485), settings/page.tsx (402) still monolithic. Decomposition has been the trend but these 3 remain.
2. **No integration/E2E tests** — All 636 tests are unit tests. No tests exercise the API routes or UI flows.
3. **No accessibility audit** — Some a11y attributes were added (graph keyboard nav) but no systematic coverage.
4. **No i18n** — All strings hardcoded in English.

## Bugs / Friction Found

1. **Build warnings (benign)** — 3 ENOENT warnings during build for missing wiki/index.md and wiki/log.md. Not errors, but noisy. Could be suppressed or handled with a "first-run" initialization.
2. **Test stderr noise** — query-history tests emit ENOENT warnings to stderr (expected behavior logged with `console.error`). Not a bug but clutters test output.
3. **No TODOs/FIXMEs in source** — Clean codebase. The only grep hit for TODO/FIXME/HACK/XXX is a comment in fetch.ts explaining IPv4-mapped IPv6 format (not actionable).
4. **`wiki.ts` still 367 lines** — The status report from session ~24 flagged this as tech debt ("wiki.ts is overloaded"). Log was extracted to wiki-log.ts and search to search.ts, but index management and page caching still live alongside CRUD. Down from 440→367 but still the grab-bag.
5. **Global search fetches on every keystroke** — GlobalSearch.tsx (346 lines) calls the wiki list endpoint. Debouncing may exist but the component is large enough to warrant review.
