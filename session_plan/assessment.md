# Assessment — 2026-04-25

## Build Status
✅ PASS — `pnpm build` clean, `pnpm lint` clean, `pnpm test` 1100 tests passing across 31 test files (8.17s). Zero type errors.

## Project State
The project is mature and feature-complete relative to the founding vision. All four pillars are fully implemented:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, image downloading, source URL tracking, re-ingest for staleness detection, CLI `ingest` command
- **Query** — BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming answers, save-to-wiki, query history, table format option, CLI `query` command
- **Lint** — 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix, configurable severity filtering, CLI `lint` command
- **Browse** — Wiki index with sort/filter/date-range, dataview frontmatter queries, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export

Supporting infrastructure: multi-provider LLM (Anthropic/OpenAI/Google/Ollama), onboarding wizard, dark mode, mobile responsive layout, Docker deployment, CLI tool.

~45 growth sessions completed since bootstrap on 2026-04-06.

## Recent Changes (last 3 sessions)

1. **Session ~45 (2026-04-24)** — Dataview query UI on wiki index page (filter by frontmatter), local image downloading during ingest (saves to `raw/assets/<slug>/`)
2. **Session ~44 (2026-04-24)** — Dataview query library + API, re-ingest endpoint for URL freshness, source URL tracking in page frontmatter
3. **Session ~43 (2026-04-23)** — Schema extraction (`loadPageConventions`), SCHEMA.md cleanup, raw source 404 fix, test noise silencing

Recent trajectory: polish and capability additions on an already-complete foundation. No major architectural changes.

## Source Architecture

### Codebase size: ~30,100 lines across ~139 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 33 | 7,305 | Core logic — ingest, query, lint, embeddings, config, lifecycle, etc. |
| `src/lib/__tests__/` | 31 | 14,329 | Test suites (2× the lib code) |
| `src/components/` | 24 | 3,675 | React components |
| `src/app/` (pages) | 13 | 1,753 | Next.js page components |
| `src/app/api/` (routes) | 20 | 1,431 | API route handlers |
| `src/hooks/` | 3 | 961 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation) |

### Largest files (complexity hotspots)

| File | Lines | Role |
|------|------:|------|
| `fetch.ts` | 710 | URL fetching, SSRF protection, Readability, image download |
| `lint-checks.ts` | 534 | All 7 lint check implementations |
| `ingest.ts` | 490 | Ingest pipeline + LLM orchestration |
| `embeddings.ts` | 478 | Vector store, embedding CRUD, rebuild |
| `query.ts` | 477 | Query pipeline, BM25+RRF, context building |
| `search.ts` | 465 | Related pages, backlinks, fuzzy search |
| `lint-fix.ts` | 458 | Auto-fix for all 7 lint issues |
| `useGraphSimulation.ts` | 451 | Force simulation + canvas rendering hook |
| `config.ts` | 402 | Provider detection, settings resolution |
| `wiki.ts` | 385 | Core filesystem ops, index management |
| `WikiIndexClient.tsx` | 364 | Wiki index UI with filtering/sorting |
| `GlobalSearch.tsx` | 356 | Global search with fuzzy matching |
| `DataviewPanel.tsx` | 330 | Frontmatter query UI |
| `BatchIngestForm.tsx` | 317 | Multi-URL batch ingest UI |

## Open Issues Summary
No open issues on GitHub. The project is self-directed by the founding vision.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision
The founding vision is fully implemented. The remaining items from SCHEMA.md "Known gaps" are minor:
- Token counting uses character-based approximation (not tokenizer-exact)
- File locking is in-process only (no OS-level lockfiles for multi-process)

### Relative to YOYO.md "Open Questions"
- **Obsidian plugin** — Export exists but no real plugin. The founding vision specifically calls out Obsidian as the browsing IDE.
- **Multi-user / auth** — Not implemented. Current architecture is single-user, local-first.
- **E2E tests** — No Playwright/Cypress tests. All 1100 tests are unit/integration level.

### New capability gaps
1. **No component tests** — All 24 React components have zero test coverage. Components contain significant logic (filtering, state management, form validation).
2. **No API route tests** — All 20 API routes are tested only indirectly through the lib layer.
3. **Query re-ranking quality** — Flagged as a priority in the journal for 10+ sessions but never tackled. The LLM re-ranker only considers fusion candidates but could benefit from better prompt engineering or multi-stage ranking.
4. **Structured logging** — 31 `console.warn/error` calls scattered across lib modules. No log levels, no structured output, no way to control verbosity.
5. **Wiki page templates** — Users can create pages but there's no template system for consistent structure across page types (entity, concept, comparison, etc.).
6. **Notification/progress for long operations** — Ingest and lint can take 10+ seconds with LLM calls but provide no progress feedback beyond a spinner.

### Ecosystem opportunities
- MCP server for tool-use LLM integration (mentioned in founding vision via `qmd`)
- Webhook/API for external ingest (Slack, email, RSS)
- Export to other formats (PDF, EPUB, static site)

## Bugs / Friction Found

### Code quality issues
1. **6 bare `catch {}` blocks** in lib code (`fetch.ts`, `search.ts`, `revisions.ts` ×3, `wiki.ts`) — silently swallowing errors with no logging or re-throw. Some may be intentional (ENOENT fallbacks) but the pattern is fragile.
2. **Accessibility gaps** — ~10 buttons in components (`RevisionHistory`, `LintFilterControls`, `WikiIndexClient`) lack `aria-label` attributes. Prior sessions added ARIA landmarks and skip-nav but interactive elements still have gaps.
3. **Large component files** — 4 components exceed 300 lines (`WikiIndexClient`, `GlobalSearch`, `DataviewPanel`, `BatchIngestForm`) and would benefit from decomposition, as noted in the status report's tech debt section.
4. **Only 1 TODO remaining in source** — A comment in `fetch.ts` about IPv4-mapped IPv6. Very clean codebase.

### No build/test issues
- Build is clean with zero warnings
- All 1100 tests pass
- ESLint passes clean
- No flaky tests detected in this run
