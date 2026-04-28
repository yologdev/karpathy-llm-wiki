# Assessment — 2026-04-28

## Build Status

✅ **All green** — `pnpm build` succeeds (20 routes), `pnpm lint` clean (0 warnings), `pnpm test` passes 1168 tests across 34 test files in ~9s.

## Project State

The project is a mature, fully functional implementation of the LLM Wiki pattern. All four founding vision pillars are complete:

| Pillar | Key Capabilities |
|--------|-----------------|
| **Ingest** | URL fetch (Readability + linkedom), text paste, batch multi-URL, preview mode, raw source persistence, image download, source URL tracking, re-ingest for staleness detection, CLI `ingest` |
| **Query** | BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming answers, cited sources, table format toggle, save-to-wiki loop, query history, CLI `query` |
| **Lint** | 7 check types (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept), configurable checks/severity, auto-fix for all types, source suggestions, CLI `lint` |
| **Browse** | Wiki index with sort/filter/date-range/dataview, page view with backlinks, edit/delete/create with templates, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export |

Additional infrastructure: onboarding wizard, dark mode, mobile responsive layouts, accessibility (skip-nav, ARIA landmarks, focus management, aria-labels), Docker deployment, structured logger, CLI tool with 8 subcommands.

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~52 | 2026-04-27 | Lint source suggestions (LLM generates search queries for knowledge gaps), wired into LintIssueCard UI, security patches for next/vitest/postcss |
| ~51 | 2026-04-27 | Test suites for lint-checks.ts (400 lines) and schema.ts (235 lines), loading skeletons for 5 remaining pages |
| ~50 | 2026-04-26 | DataviewPanel decomposition (DataviewFilterRow, DataviewResultsTable), GlobalSearch → useGlobalSearch hook + SearchResultItem, TemplateSelector component wired to SCHEMA.md templates |

Theme: recent sessions are polish — component decomposition, test backfill, loading states, accessibility, and UI refinement. No new major features in the last ~10 sessions.

## Source Architecture

**161 source files, ~31,900 total lines** (lib: 7,524 / tests: 15,243 / pages+routes: 3,863 / components: 3,746 / hooks: 1,227)

### Largest files (non-test)

| File | Lines | Role |
|------|------:|------|
| `fetch.ts` | 715 | URL fetching, SSRF protection, Readability extraction, image download |
| `lint-checks.ts` | 545 | Individual lint check implementations |
| `query.ts` | 530 | Query pipeline: search, re-rank, build context, call LLM |
| `ingest.ts` | 490 | Ingest pipeline (now mostly a re-export façade + core logic) |
| `embeddings.ts` | 479 | Vector store CRUD, embedding providers, cosine similarity |
| `search.ts` | 469 | BM25 content search, related pages, backlinks, fuzzy search |
| `lint-fix.ts` | 458 | Auto-fix implementations for all lint issue types |
| `useGraphSimulation.ts` | 451 | Force-directed graph physics + canvas rendering hook |
| `config.ts` | 403 | Centralized config store, env var resolution, provider detection |
| `wiki.ts` | 390 | Core filesystem ops (read/write/list/index), page cache |

### Test coverage

34 test files covering every lib module except `constants.ts` (static values) and `types.ts` (type-only). Heaviest suites: `wiki.test.ts` (1924 lines), `ingest.test.ts` (1776 lines), `query.test.ts` (1239 lines), `fetch.test.ts` (1202 lines).

## Open Issues Summary

**No open issues** on GitHub. The issue queue is empty.

## Gaps & Opportunities

Comparing the current implementation against the llm-wiki.md founding vision and YOYO.md direction:

### 1. API route `console.error` calls not using structured logger
11 API routes and 2 components still use raw `console.error` instead of the structured `logger` module built in session ~48. The logger exists and is used in lib code, but the API layer was never migrated. This is the kind of inconsistency that accumulates silently — the logger supports tag-based filtering and configurable levels, but API errors bypass it entirely.

### 2. Large components still awaiting decomposition
`BatchIngestForm.tsx` (317 lines) and `RevisionHistory.tsx` (231 lines) were flagged in the status report as needing decomposition. Other sizeable components: `QueryResultPanel.tsx` (241 lines), `NavHeader.tsx` (224 lines), `ProviderForm.tsx` (210 lines).

### 3. Re-export façades creating coupling complexity
`ingest.ts` has accumulated ~20 re-exports (`slugify`, `loadPageConventions`, `isUrl`, `stripHtml`, `extractTitle`, `extractWithReadability`, `htmlToMarkdown`, `validateUrlSafety`, `fetchUrlContent`, `downloadImages`, `findRelatedPages`, `updateRelatedPages`) from modules that were extracted in prior sessions. This keeps old import paths working but creates a dependency web where importing anything from `ingest` pulls in everything. Eventually these re-exports should be cleaned up and callers updated to import from the actual source modules.

### 4. No E2E / integration tests
All 1168 tests are unit tests mocking the LLM layer. There are no end-to-end tests exercising the actual API routes with a real HTTP request flow (Playwright, Cypress, or even supertest against Next.js). The status report lists this as Priority 2.

### 5. Obsidian plugin (ecosystem gap)
The export utility converts wiki links to Obsidian wikilinks (27 lines in `export.ts`), and there's a ZIP export API, but there's no actual Obsidian plugin. The founding vision explicitly mentions Obsidian as the companion viewer. This is listed as Priority 3 in the status report.

### 6. Query re-ranking quality
Repeatedly mentioned as "next" in journal entries for the last ~15 sessions but never prioritized. The current approach uses LLM re-ranking of BM25+vector candidates, but journal entries suggest the quality could be improved. This keeps getting deferred in favor of decomposition and test work.

### 7. `graph-render.test.ts` is thin
Only 33 lines — contrasts with `useGraphSimulation.ts` at 451 lines and `graph-render.ts` at 155 lines. The graph rendering logic (color palettes, node radius calculations, rounded rect drawing) has minimal test coverage.

### 8. Multi-user / auth support
Listed as an open question in YOYO.md and Priority 3 in the status report. Currently single-user, local-first. No auth, no user isolation.

## Bugs / Friction Found

1. **No bugs detected** — build, lint, and all 1168 tests pass cleanly. No type errors, no warnings.

2. **Minor inconsistency: logger adoption incomplete** — The structured logger module exists but API routes still use `console.error`. Not a bug, but a friction point for anyone trying to configure log levels or filter by tag in production — API errors won't respect the LOG_LEVEL setting.

3. **Re-export complexity in ingest.ts** — While functional, the ~20 re-exports create a maintenance burden. Any new test or caller that imports from `ingest` gets transitive dependencies on `fetch.ts`, `schema.ts`, `slugify.ts`, `search.ts`, and `wiki.ts`. This inflates test setup and makes dependency graphs harder to reason about.

4. **`graph-render.test.ts` coverage gap** — Pure functions like `nodeRadius`, `getColorPalette`, and the constant definitions in `graph-render.ts` are testable without DOM mocking but barely tested. A regression in color palettes or radius scaling would go unnoticed.
