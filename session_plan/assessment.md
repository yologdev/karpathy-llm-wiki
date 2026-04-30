# Assessment — 2026-04-30

## Build Status
**✅ ALL PASS** — `pnpm build` succeeds (zero warnings, zero errors), `pnpm lint` clean, `pnpm test` passes 1242 tests across 39 test files in 8.45s. Zero `any` types. Zero TODOs in production code.

## Project State
The project is a mature, fully-featured Next.js 15 web application implementing all four pillars of the LLM Wiki founding vision. ~55 growth sessions have been completed since bootstrap on 2026-04-06.

### Feature completeness (vs. llm-wiki.md vision)

| Feature | Status | Notes |
|---------|--------|-------|
| **Ingest** (URL, text, batch) | ✅ Complete | URL fetch w/ Readability, text paste, batch multi-URL, image download, preview, re-ingest staleness detection |
| **Query** (search, cite, save) | ✅ Complete | BM25 + optional vector search w/ RRF fusion, streaming, history, save-to-wiki, table + Marp slide formats |
| **Lint** (health-check) | ✅ Complete | 7 checks (orphans, broken links, empty pages, stale index, missing cross-refs, contradictions, missing concepts), auto-fix, source suggestions |
| **Browse** (navigate wiki) | ✅ Complete | Wiki index w/ sort/filter/search, page view w/ backlinks, graph view w/ clustering, edit/delete/create, revision history w/ diffs & restore, raw source browser, activity log, global fuzzy search, dataview queries, Obsidian export |
| **CLI** | ✅ Complete | ingest, query, lint, list, status subcommands |
| **Multi-provider LLM** | ✅ Complete | Anthropic, OpenAI, Google, Ollama via Vercel AI SDK |
| **Deployment** | ✅ Complete | Docker + docker-compose, self-hosting guide (DEPLOY.md) |
| **UX polish** | ✅ Complete | Dark mode, onboarding wizard, keyboard shortcuts, toast notifications, mobile responsive, accessibility (skip-nav, aria, focus management) |

### What the founding vision mentions but isn't implemented
- **Obsidian plugin** — export exists (converts wiki links to `[[wikilinks]]`), but no actual Obsidian plugin
- **Multi-user / auth** — listed as open question in YOYO.md; not started
- **Canvas output format** — mentioned in llm-wiki.md §Query; not implemented (table + slides exist)
- **Chart/matplotlib output** — mentioned in llm-wiki.md §Query; not applicable to web context
- **Marp rendering in-app** — slides format generates Marp markdown but there's no in-app preview/render

## Recent Changes (last 3 sessions)
Based on journal entries:

1. **Session ~55 (2026-04-30 03:48)** — Keyboard shortcuts with vim-style sequences (`g h`, `g w`, `/`, `?`) and toast notification system with auto-dismiss and variant styling. Both follow hook + provider + presenter decomposition.

2. **Session ~54 (2026-04-29 14:19)** — Extracted `useLint` and `useIngest` hooks from page components with unit tests for `fixKey` and `validateIngestInput`. Pages are now thin rendering shells.

3. **Session ~53 (2026-04-29 03:47)** — End-to-end integration test for ingest→query pipeline, Marp slide deck query format, client-side wiki index pagination.

## Source Architecture

### Codebase size: ~33,600 lines across ~176 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` (core) | 34 | 7,506 | ingest, query, lint, search, embeddings, config, wiki, lifecycle, etc. |
| `src/lib/__tests__/` | 39 | 16,158 | Unit and integration tests |
| `src/app/` (pages + routes) | 58 | 3,506 | 13 page routes, 21 API routes, error/loading boundaries |
| `src/components/` | 36 | 4,073 | React UI components |
| `src/hooks/` | 8 | 2,088 | Custom hooks (settings, streaming query, graph sim, search, etc.) |

### Largest production files (decomposition candidates)
| File | Lines | Notes |
|------|------:|-------|
| `fetch.ts` | 715 | URL fetching, HTML parsing, image download, SSRF protection |
| `query.ts` | 549 | Search, context building, LLM query, save-to-wiki |
| `lint-checks.ts` | 545 | All 7 lint check implementations |
| `embeddings.ts` | 479 | Vector store, embedding, similarity search |
| `search.ts` | 469 | BM25 content search, related pages, fuzzy search |
| `lint-fix.ts` | 458 | Auto-fix for all lint issue types |
| `ingest.ts` | 453 | Core ingest pipeline |
| `useGraphSimulation.ts` | 451 | Force simulation + canvas rendering (hook) |

### API routes (21 total)
Ingest (3): `/api/ingest`, `/api/ingest/batch`, `/api/ingest/reingest`  
Query (4): `/api/query`, `/api/query/stream`, `/api/query/history`, `/api/query/save`  
Lint (2): `/api/lint`, `/api/lint/fix`  
Wiki (7): `/api/wiki`, `/api/wiki/[slug]`, `/api/wiki/[slug]/revisions`, `/api/wiki/graph`, `/api/wiki/search`, `/api/wiki/dataview`, `/api/wiki/export`, `/api/wiki/templates`  
Settings (2): `/api/settings`, `/api/settings/rebuild-embeddings`  
Other (2): `/api/status`, `/api/raw/[slug]`

## Open Issues Summary
No open issues on GitHub (`gh issue list` returns empty array).

## Gaps & Opportunities

### High-value improvements (aligned with vision)
1. **E2E / browser testing** — The app has 1242 unit tests but zero Playwright/Cypress tests. Critical user flows (ingest a URL → see it in wiki → query against it) are untested at the browser level.
2. **Query re-ranking quality** — Mentioned as "next" in every journal entry since session ~30 but never tackled. The current BM25 + optional vector search could benefit from LLM-based re-ranking of candidate pages before context stuffing.
3. **Streaming query UX** — Streaming endpoint exists but the query page could improve progressive rendering and cancel support.
4. **Large file decomposition** — `useGraphSimulation.ts` (451 lines), `fetch.ts` (715 lines), and `query.ts` (549 lines) are the remaining monoliths in production code.
5. **Real Obsidian plugin** — Export converts links but there's no installable plugin. The founding vision specifically mentions Obsidian as the IDE.

### New capabilities worth exploring
6. **PDF / file upload ingest** — Currently only URL and text paste; file upload (PDF, DOCX, etc.) would expand source types significantly.
7. **Web search integration** — llm-wiki.md §Lint mentions "data gaps that could be filled with a web search." The lint source suggestions exist but don't auto-search.
8. **Multi-wiki support** — Different data directories for different knowledge bases (e.g., research wiki vs. personal wiki).
9. **Real-time collaboration** — WebSocket-based live updates when the wiki changes.

### Code quality
10. **2 stray `console.error` calls** — `WikiIndexClient.tsx:51` and `QueryResultPanel.tsx:57` should use the structured logger.
11. **Test:production ratio is 2.15:1** — healthy, but the integration test coverage (1 test) is thin compared to unit tests.

## Bugs / Friction Found
- **No bugs found** — build, lint, and all 1242 tests pass cleanly. Zero type errors, zero `any` types, zero lint warnings.
- **Minor: 2 console.error calls** in components that should use the logger (cosmetic, not functional).
- **Architectural: query re-ranking** has been the stated "next" item for 25+ sessions without being addressed — suggests either the task is poorly scoped or lower priority than stated.
- **Git history is shallow** — CI checkout only has 1 commit visible, which limits `git log` analysis. Not a code issue but affects assessment quality.
