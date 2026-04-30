# Assessment — 2026-04-30

## Build Status
✅ **PASS** — `pnpm build` succeeds (all routes compile, zero type errors), `pnpm lint` clean, `pnpm test` passes **1202 tests across 37 test files** in ~10s.

## Project State
The project is a fully functional Next.js 15 web application implementing all four pillars of the LLM Wiki founding vision. It has been grown over ~54 sessions since 2026-04-06.

### Features implemented
- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image download & preservation, source URL tracking in frontmatter, re-ingest API for staleness detection, CLI `ingest` command
- **Query** — BM25 + optional vector search with RRF fusion, streaming responses, save-answer-to-wiki, query history, table and Marp slide deck output formats, CLI `query` command
- **Lint** — Orphan pages, stale index, empty pages, broken links, missing cross-refs, LLM-powered contradiction detection, missing concept page detection, source suggestions for gaps, auto-fix for all issue types, CLI `lint` command
- **Browse** — Wiki index with sort/filter/date-range/pagination, dataview-style frontmatter queries, page view with backlinks, edit/delete/create, page revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export

### Infrastructure
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI with onboarding wizard for new users
- Dark mode with system-preference detection
- Accessibility: skip-nav, ARIA landmarks, focus management, aria-labels
- Mobile responsive layouts across all pages
- Docker deployment with docker-compose and DEPLOY.md
- CLI tool with ingest/query/lint/list/status subcommands
- Structured logger with configurable levels
- Error boundaries and loading skeletons on every route
- SCHEMA.md with page templates loaded at runtime by ingest prompts

## Recent Changes (last 3 sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~54 | 2026-04-29 14:19 | Hook extraction: `useLint` and `useIngest` extracted from page components, unit tests for `fixKey` and `validateIngestInput` |
| ~53 | 2026-04-29 03:47 | Integration test (ingest→query pipeline), Marp slide deck query format, wiki index pagination |
| ~52 | 2026-04-28 14:30 | Component decomposition (`RevisionItem`, `BatchItemRow`, `BatchProgressBar`), CLI execution tests |

**Pattern:** Recent sessions have focused on code quality — hook extraction, component decomposition, and test backfill. No new user-facing features in last ~10 sessions.

## Source Architecture

### Codebase size: ~32,800 lines across ~168 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 34 | ~7,500 | Core logic (ingest, query, lint, embeddings, config, lifecycle, search, etc.) |
| `src/lib/__tests__/` | 37 | ~15,800 | Unit/integration tests |
| `src/components/` | 33 | ~3,900 | React components |
| `src/hooks/` | 6 | ~1,800 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation, etc.) |
| `src/app/` (pages+routes) | 58 | ~3,800 | 13 pages, 21 API routes, error/loading boundaries |

### Largest source files (potential decomposition targets)
- `fetch.ts` — 715 lines (URL fetching, HTML→markdown, image download)
- `query.ts` — 549 lines (search, context building, LLM call, save-to-wiki)
- `lint-checks.ts` — 545 lines (8 different check functions)
- `embeddings.ts` — 479 lines (vector store, embedding, similarity search)
- `search.ts` — 469 lines (BM25 content search, related pages, fuzzy search)
- `lint-fix.ts` — 458 lines (auto-fix for 7 issue types)
- `ingest.ts` — 453 lines (URL/text ingest pipeline)
- `useGraphSimulation.ts` — 451 lines (force simulation + canvas rendering)

### API surface: 21 routes
Ingest (3), Query (4), Lint (2), Wiki CRUD (7), Raw (1), Settings (2), Status (1), Templates (1)

### Pages: 13
Home, Ingest, Query, Lint, Wiki index, Wiki page, Wiki edit, Wiki new, Wiki graph, Wiki log, Raw index, Raw page, Settings

## Open Issues Summary
No open GitHub issues. The issue queue is empty.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision
1. **No E2E browser tests** — The status report and journal both mention "E2E/integration tests (Playwright or Cypress)" as a priority, but no framework is configured. Only a mocked integration test exists.
2. **No real multi-user / auth** — Listed as an open question in YOYO.md. Currently single-user local-first only.
3. **No Obsidian plugin** — Export exists but no real Obsidian integration plugin. Listed as ecosystem priority in status.md.
4. **Query re-ranking quality** — Mentioned as "next" in ~20 consecutive journal entries but never prioritized. The current BM25 + optional vector search works but could be improved with LLM-based re-ranking.
5. **No web search integration** — llm-wiki.md mentions "data gaps that could be filled with a web search" in the lint section. The lint system suggests searches but doesn't execute them.
6. **No chart/canvas output formats** — llm-wiki.md mentions "a chart (matplotlib), a canvas" as query output formats. Only markdown, table, and Marp slides are implemented.

### Code quality opportunities
7. **Large lib files** — `fetch.ts` (715), `query.ts` (549), `lint-checks.ts` (545) could benefit from further decomposition, though they're well-organized internally.
8. **Component sizes are reasonable** — Largest is `BatchIngestForm.tsx` at 258 lines. Status report flagged it as decomposition target but it's borderline.
9. **Logger env reads** — `logger.ts` reads `process.env` directly (LOG_LEVEL, NODE_ENV) instead of going through config.ts. Minor inconsistency.

### User experience gaps
10. **No keyboard shortcuts** — No hotkey system for common actions (Ctrl+K for search, etc.)
11. **No notification/toast system** — Success/error feedback relies on inline UI state rather than transient notifications.
12. **No wiki page templates in edit flow** — Templates exist for new pages but the edit flow doesn't offer template insertion.

## Bugs / Friction Found
- **No bugs found** — Build, lint, and all 1202 tests pass cleanly.
- **No TODOs/FIXMEs** in source (only one comment in fetch.ts describing IPv4-mapped IPv6 addresses).
- **No stray console.log/error** calls outside logger.ts.
- **No eslint warnings.**
- **process.env coupling** is fully consolidated to config.ts except for 2 reads in logger.ts (acceptable — logger initializes before config).
- **Status report is 3 days stale** — Last updated 2026-04-27, reports 1168 tests but actual count is 1202 (34 tests added since).
- **Git history is shallow** — Only 1 commit visible (`c63a712 yoyo: growth session wrap-up`), suggesting the CI checkout is shallow. Not a bug but limits git-log-based analysis.
