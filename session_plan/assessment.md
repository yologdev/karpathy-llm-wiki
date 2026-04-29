# Assessment — 2026-04-29

## Build Status
✅ PASS — `pnpm build` succeeds (20 routes, 0 type errors), `pnpm lint` clean, `pnpm test` passes (1180 tests across 35 test files, 6.88s)

## Project State
The project is a mature, feature-complete implementation of Karpathy's LLM Wiki pattern as a Next.js 15 web app. All four founding vision pillars are fully functional:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview before commit, image download, raw source persistence, source URL tracking, re-ingest for staleness detection, CLI command
- **Query** — BM25 + optional vector search (RRF fusion), LLM-reranked page selection, streaming answers with citations, save-answer-to-wiki loop, table and Marp slide formats, query history, CLI command
- **Lint** — 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix, LLM-powered contradiction detection, source suggestions for gaps, CLI command
- **Browse** — Wiki index with sort/filter/pagination/dataview queries, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive force-directed graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export

Supporting infrastructure: multi-provider LLM (Anthropic/OpenAI/Google/Ollama via Vercel AI SDK), settings UI with onboarding wizard, dark mode, Docker deployment, structured logging, SCHEMA.md page templates, comprehensive error boundaries and loading skeletons on every route.

## Recent Changes (last 3 sessions)
From journal.md:

1. **2026-04-29 03:47** — End-to-end integration test (ingest→query pipeline with mocked LLM), Marp slide deck as query format, client-side pagination on wiki index
2. **2026-04-28 14:30** — Component decomposition (RevisionHistory→RevisionItem, BatchIngestForm→BatchItemRow+BatchProgressBar), CLI execution tests against mocked core libs
3. **2026-04-28 03:50** — Structured logger migration across all 10 API routes, cleaned up stale re-export façade in ingest.ts

Git log shows a single squashed commit (`624e992 yoyo: growth session wrap-up`) — history is squashed on push.

## Source Architecture
**165 source files, ~32,400 total lines**

### Core Library (`src/lib/` — 33 modules, 7,506 lines)
| Module | Lines | Purpose |
|--------|------:|---------|
| fetch.ts | 715 | URL fetching, SSRF protection, Readability, image download |
| query.ts | 549 | Query pipeline: BM25+vector search, RRF, LLM synthesis |
| lint-checks.ts | 545 | 7 lint check implementations |
| embeddings.ts | 479 | Vector store, embedding generation, cosine search |
| search.ts | 469 | BM25 content search, related pages, fuzzy search |
| lint-fix.ts | 458 | Auto-fix for all 7 lint issue types |
| ingest.ts | 453 | Ingest pipeline: URL/text → raw + wiki pages |
| config.ts | 403 | Centralized config, provider detection, settings |
| wiki.ts | 390 | Wiki CRUD, index management, page cache |
| lifecycle.ts | 358 | Write/delete with side effects (index, log, cross-refs) |
| llm.ts | 329 | LLM abstraction, retry, streaming |
| (22 others) | 1,358 | dataview, frontmatter, graph, bm25, revisions, etc. |

### Tests (`src/lib/__tests__/` — 35 files, 15,645 lines)
Every lib module has a dedicated test suite except `constants.ts` (static values) and `types.ts` (type-only). Notable suites: wiki (1,924 lines), ingest (1,777), query (1,239), fetch (1,202), lint (1,176), embeddings (1,128).

### Pages (`src/app/` — 13 pages, 21 API routes)
| Route | Lines | Purpose |
|-------|------:|---------|
| /ingest | 363 | Ingest form (text/URL/batch) with preview |
| /lint | 320 | Lint results with filter/fix controls |
| /query | 202 | Query interface with streaming + history |
| /settings | 182 | Provider config, embedding settings |
| /wiki/new | 148 | New page creation with template selector |
| /wiki/[slug] | 146 | Page view with backlinks, metadata |
| (7 others) | 407 | raw browser, graph, log, edit, index, home |

### Components (`src/components/` — 33 components, 3,864 lines)
Largest: BatchIngestForm (258), QueryResultPanel (241), WikiIndexClient (235), NavHeader (224), ProviderForm (210).

### Hooks (`src/hooks/` — 4 hooks, 1,227 lines)
useGraphSimulation (451), useSettings (321), useGlobalSearch (266), useStreamingQuery (189).

## Open Issues Summary
**No open issues.** All 3 historical issues are closed (bootstrap, Vercel AI SDK migration, status report). The project is community-driven via issues but currently has none pending.

## Gaps & Opportunities
Relative to the founding vision (`llm-wiki.md`) and project direction (`YOYO.md`):

### Vision gaps (things llm-wiki.md describes that aren't fully realized)
1. **No E2E/integration tests with a real browser** — The status report lists "E2E/integration tests (Playwright or Cypress)" as Priority 2. There's one integration test (mocked LLM), but no browser-based E2E tests verifying the full user flow.
2. **No Obsidian plugin** — Export-to-Obsidian exists (link format conversion), but the founding vision describes Obsidian as "the IDE" with a real-time editing loop. A proper Obsidian plugin or MCP server would close this gap.
3. **No multi-user/auth** — Listed as an open question in YOYO.md. The app is single-user, local-first only.
4. **No chart/canvas output formats** — llm-wiki.md mentions "a chart (matplotlib), a canvas" as query output formats. Currently only markdown, table, and Marp slides are supported.

### Quality & architecture opportunities
5. **Page files are still large** — `ingest/page.tsx` (363 lines) and `lint/page.tsx` (320 lines) are the largest page components. The decomposition campaign has addressed components but these pages still mix a lot of state management with rendering.
6. **No component tests** — All 1,180 tests are in `src/lib/__tests__/`. Zero tests for React components, hooks, or pages. This is a significant coverage gap for a UI-heavy app.
7. **Token counting is character-based** — SCHEMA.md notes this: "Token counting is character-based (not tokenizer-exact), which is conservative but not precise." Could use tiktoken or similar for accuracy.
8. **Single-process file locking** — `withFileLock()` only protects within one Node.js process. Multiple server processes would corrupt shared files.
9. **No rate limiting on API routes** — Public-facing API routes have no rate limiting or abuse protection.
10. **Ingest page state machine** — The ingest page manages 3 modes × 3 stages with useState, which would benefit from a reducer or state machine pattern.

### Ecosystem opportunities
11. **MCP server** — Karpathy's vision mentions MCP as a tool integration path. Building an MCP server would let any MCP-compatible LLM agent interact with the wiki.
12. **Webhook/automation support** — No way to trigger ingests programmatically from external sources (RSS feeds, Slack, email).

## Bugs / Friction Found
- **No bugs found.** Build, lint, and all 1,180 tests pass cleanly. No TODOs or FIXMEs in source code. No stray console.log calls (structured logger fully adopted). ESLint produces zero warnings.
- **Minor friction:** The `ingest/page.tsx` (363 lines) and `lint/page.tsx` (320 lines) remain the largest page components and could be harder to maintain as features grow. The status report already flags `BatchIngestForm` (258 lines) and `RevisionHistory` (183 lines, down from earlier) as decomposition candidates, though these are now under 300 lines each.
- **Dependency note:** `pnpm` overrides are in place for `vite` (^7.3.2) and `postcss` (^8.5.10) to patch security vulnerabilities. These should be periodically reviewed as upstream packages update.
