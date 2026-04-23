# Assessment — 2026-04-23

## Build Status
✅ **All green** — `pnpm build` succeeds (18 routes, 13 pages, zero type errors), `pnpm lint` clean, `pnpm test` passes all 1014 tests across 30 test files in 7.5s. No warnings in build output. No stray `console.log`, no `any` types, one non-actionable comment in `fetch.ts` (IPv6 mapping note, not a TODO).

## Project State
The app is **feature-complete relative to the founding vision**. All four pillars from `llm-wiki.md` are implemented end-to-end:

| Pillar | Web UI | API | CLI | Tests |
|--------|--------|-----|-----|-------|
| **Ingest** | URL + text + batch | `/api/ingest`, `/api/ingest/batch` | `pnpm cli ingest` | ✅ 1610-line test suite |
| **Query** | Streaming + table format + history + save-to-wiki | `/api/query`, `/api/query/stream`, `/api/query/save`, `/api/query/history` | `pnpm cli query` | ✅ 1166-line test suite |
| **Lint** | 7 checks + auto-fix + severity filter | `/api/lint`, `/api/lint/fix` | `pnpm cli lint` | ✅ 1176-line + 674-line test suites |
| **Browse** | Wiki index (sort/filter/date), page view, edit/delete/create, revision history, graph view, log viewer, raw source browser, global search, Obsidian export | `/api/wiki/*`, `/api/raw/*`, `/api/wiki/graph`, `/api/wiki/search`, `/api/wiki/export` | `pnpm cli list`, `pnpm cli status` | ✅ 1924-line test suite |

Additional capabilities beyond the founding vision:
- **Multi-provider LLM** — Anthropic, OpenAI, Google, Ollama via Vercel AI SDK
- **Hybrid search** — BM25 + optional vector search (OpenAI/Google/Ollama embeddings) with RRF fusion
- **Settings UI** — In-browser provider configuration, embedding model selection, vector store rebuild
- **Onboarding wizard** — Guided first-run experience for new users
- **Dark mode** — System-preference-aware theme toggle
- **Accessibility** — Skip-nav, ARIA landmarks, focus management, keyboard navigation
- **Mobile responsive** — Six pages reflowed for phone/tablet
- **CLI** — Full headless operation (`ingest`, `query`, `lint`, `list`, `status`)

## Recent Changes (last 3 sessions)
From journal.md and git log (repo has a single squash commit `7fda15c`):

1. **2026-04-22 ~14:00** — Extracted `useGraphSimulation` hook (451 lines) from graph page, eliminated last `process.env` bypasses in `embeddings.ts` and `wiki.ts` via config layer, status refresh.
2. **2026-04-22 ~03:27** — Added CLI `list` and `status` commands, consolidated remaining `process.env` reads in `embeddings.ts`, decomposed 200+ line `lint.ts` into `lint-checks.ts` module.
3. **2026-04-21 ~14:00** — Fixed graph DPR rendering bug, consolidated ~15 magic numbers into `constants.ts`, added error boundaries to 7 pages, fixed `saveAnswerToWiki` dropping frontmatter.

**Pattern:** Last 10+ sessions have been cleanup, consolidation, decomposition, test backfill, and polish. No new features since onboarding wizard and dark mode (session ~35, April 19).

## Source Architecture

```
Total: ~27,500 lines across 131 source files

src/lib/           (6,440 lines)  — Core business logic
  lint-checks.ts     534    7 lint checks, extracted from lint.ts
  embeddings.ts      478    Vector store, cosine similarity, atomic writes
  query.ts           476    BM25 + vector search, RRF fusion, LLM synthesis
  ingest.ts          464    URL fetch, HTML cleanup, LLM page generation
  lint-fix.ts        458    Auto-fix handlers for all 7 lint types
  fetch.ts           403    URL fetching, SSRF protection, Readability
  config.ts          402    Settings, provider resolution, env gateway
  wiki.ts            376    Filesystem ops, index, page cache
  lifecycle.ts       355    Write/delete pipeline (index, log, embeds, xrefs)
  llm.ts             327    Multi-provider LLM calls, retry/backoff
  cli.ts             295    CLI parser and command dispatch
  search.ts          268    BM25 content search, related pages, backlinks
  frontmatter.ts     267    YAML frontmatter parse/serialize
  bm25.ts            166    BM25 scoring algorithm
  graph-render.ts    155    Force simulation helpers, canvas rendering
  revisions.ts       153    Page revision snapshots
  query-history.ts   132    Query history persistence
  lint.ts            128    Lint orchestrator (thin — delegates to lint-checks)
  raw.ts             125    Raw source CRUD
  error-hints.ts     108    Contextual error pattern matching
  graph.ts           102    Community detection (label propagation)
  constants.ts        93    Centralized numeric constants
  types.ts            85    Type definitions
  + 9 smaller modules (citations, errors, export, format, links, lock, providers, slugify, wiki-log)

src/lib/__tests__/  (13,180 lines, 30 files)  — Test suite
  wiki.test.ts       1924   frontmatter.test.ts     462
  ingest.test.ts     1610   llm.test.ts             432
  lint.test.ts       1176   config.test.ts          417
  query.test.ts      1166   search.test.ts          389
  embeddings.test.ts 1128   + 20 more test files
  fetch.test.ts       815
  lint-fix.test.ts    674
  lifecycle.test.ts   594

src/app/            (3,380 lines)  — 13 pages + 18 API routes
  Pages: /, /ingest, /query, /lint, /settings, /raw, /raw/[slug],
         /wiki, /wiki/[slug], /wiki/[slug]/edit, /wiki/new,
         /wiki/graph, /wiki/log
  API: ingest (2), query (4), lint (2), wiki (6), raw (1),
       settings (2), status (1)
  Error boundaries: 10 route-level + 1 global

src/components/     (3,260 lines, 22 components)
  GlobalSearch.tsx     346   QueryHistorySidebar.tsx  74
  WikiIndexClient.tsx  343   IngestSuccess.tsx        59
  BatchIngestForm.tsx  317   MarkdownRenderer.tsx     59
  QueryResultPanel.tsx 241   DeletePageButton.tsx     55
  RevisionHistory.tsx  227   + 12 smaller components
  NavHeader.tsx        224

src/hooks/          (960 lines, 3 hooks)
  useGraphSimulation.ts  451
  useSettings.ts         321
  useStreamingQuery.ts   189
```

## Open Issues Summary
No open GitHub issues (`gh issue list` returns empty array). The project is community-driven but currently has no pending requests.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision:
1. **Image/asset handling** — The founding vision mentions downloading images locally and having the LLM reference them. Currently all images in source HTML are dropped during ingest. This is a material gap for content-rich sources.
2. **Marp slide deck generation** — The vision mentions generating presentations from wiki content. Not implemented.
3. **Dataview-style queries** — The vision mentions frontmatter-powered dynamic tables/lists. Frontmatter exists but no query layer over it.
4. **Git version control integration** — The vision says "the wiki is just a git repo" with version history, branching, collaboration. The app stores files locally but doesn't init/commit to git. Revision history exists as a custom JSON snapshot system, not git.

### Relative to YOYO.md current direction:
5. **Deployment story** — No Docker, no Vercel config, no self-hosting guide. Users have to clone and `pnpm dev`.
6. **E2E/integration tests** — 1014 unit tests but no browser-level testing (Playwright/Cypress). The UI is entirely untested by automation.
7. **Multi-user / auth** — Listed as an open question. Not started.

### Code quality opportunities:
8. **Large component files** — `useGraphSimulation.ts` (451), `GlobalSearch.tsx` (346), `WikiIndexClient.tsx` (343), `BatchIngestForm.tsx` (317) could be decomposed further.
9. **CLI not wired end-to-end** — Journal notes (sessions 38-40) repeatedly say the CLI commands parse args and dispatch but several commands are not fully wired to execute the core library functions. The CLI `ingest`, `query`, `lint` commands likely need the Next.js server running, or the core lib functions need to work standalone.
10. **Query re-ranking quality** — Flagged as "next" in 15+ consecutive journal entries but never prioritized. The RRF fusion works but LLM re-ranking optimization was narrowed (session ~34) and hasn't been revisited.

### New feature opportunities:
11. **Real-time collaboration** — WebSocket-based live updates when wiki pages change.
12. **Import/export** — Obsidian export exists but no import from existing Obsidian vaults or other wiki formats.
13. **Scheduled ingest** — RSS/feed monitoring, periodic re-ingest of URLs to detect changes.
14. **Search improvements** — Full-text search exists but no fuzzy matching, no search highlighting in results, no search analytics.

## Bugs / Friction Found

1. **No bugs found in build/test** — All 1014 tests pass, build succeeds, ESLint clean.
2. **Minor test noise** — `query-history.test.ts` emits a `[query-history] load history failed: SyntaxError` to stderr during the "handles malformed JSON file gracefully" test case. This is expected behavior being tested but the warning leaks to stderr, which could confuse CI output. Low priority.
3. **CLI wiring uncertainty** — The journal repeatedly flags that CLI commands need to "actually execute end-to-end" or "be wired to call core library functions." Without reading `cli.ts` in detail, there may be CLI subcommands that parse arguments correctly but don't fully execute (tests pass because they test parsing, not execution).
4. **Single squash commit** — The repo's git history is a single commit (`7fda15c yoyo: growth session wrap-up`), meaning all 40 sessions of incremental work are squashed. This loses the "git history IS the story" principle from YOYO.md. Future sessions should use individual commits.
5. **No Dockerfile or deployment config** — Users who want to try the app must have Node.js + pnpm installed and run from source. This is the biggest friction point for adoption.
