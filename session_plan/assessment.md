# Assessment — 2026-04-24

## Build Status
✅ PASS — `pnpm build` succeeds (18 routes, zero type errors), `pnpm lint` clean, `pnpm test` passes 1054 tests across 30 test files in 7.8s.

## Project State
The project is a mature Next.js 15 web application implementing all four pillars of Karpathy's LLM Wiki pattern. ~28,200 lines across ~133 files (14,755 source, 13,505 test).

**Implemented features:**
- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image preservation, CLI `ingest` command
- **Query** — BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming answers, citation extraction, save-to-wiki, table format, CLI `query` command
- **Lint** — 7 checks (orphan-page, stale-index, empty-page, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix, configurable severity filtering, CLI `lint` command
- **Browse** — Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export

**Infrastructure:**
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Centralized config layer (zero `process.env` reads outside `config.ts`)
- Docker deployment (Dockerfile, docker-compose, DEPLOY.md)
- CLI tool with ingest/query/lint/list/status subcommands
- Dark mode, responsive mobile layouts, ARIA landmarks, skip-nav
- Onboarding wizard for new users
- Guided error hints in error boundaries

## Recent Changes (last 3 sessions)
- **Session ~43 (2026-04-23)** — Extracted `schema.ts` module, cleaned up stale SCHEMA.md known-gaps, fixed raw source 404 page import, silenced test console noise
- **Session ~42 (2026-04-23)** — Fuzzy search via Levenshtein distance, image preservation during HTML-to-markdown ingest, Docker deployment story (Dockerfile, docker-compose, DEPLOY.md)
- **Session ~41 (2026-04-22)** — Graph hook extraction (useGraphSimulation), config layer sweep (final `process.env` bypasses in embeddings.ts and wiki.ts eliminated)

Recent sessions have been polish and housekeeping — no new user-facing features in the last 3 sessions. The codebase is in a consolidation phase.

## Source Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # 18 API route files across 12 endpoints
│   │   ├── ingest/         # POST ingest, POST batch
│   │   ├── lint/           # POST lint, POST fix
│   │   ├── query/          # POST query, POST stream, GET/POST history, POST save
│   │   ├── raw/            # GET [slug]
│   │   ├── settings/       # GET/PUT settings, POST rebuild-embeddings
│   │   ├── status/         # GET status
│   │   └── wiki/           # GET/POST wiki, GET/DELETE/PUT [slug], GET graph, GET search, GET export, GET/POST revisions
│   ├── ingest/page.tsx     # 363 lines — still the largest page
│   ├── lint/page.tsx       # 320 lines
│   ├── query/page.tsx      # 191 lines
│   ├── settings/page.tsx   # 182 lines
│   ├── wiki/               # 6 sub-pages (index, [slug], edit, new, graph, log)
│   └── raw/                # 2 sub-pages (index, [slug])
├── components/             # 22 React components (3,269 lines total)
│   ├── GlobalSearch.tsx    # 356 lines — largest component
│   ├── WikiIndexClient.tsx # 343 lines
│   ├── BatchIngestForm.tsx # 317 lines
│   ├── QueryResultPanel.tsx # 241 lines
│   └── ... (18 more)
├── hooks/                  # 3 custom hooks (961 lines total)
│   ├── useGraphSimulation.ts  # 451 lines — largest hook
│   ├── useSettings.ts         # 321 lines
│   └── useStreamingQuery.ts   # 189 lines
├── lib/                    # 32 library modules (6,813 lines total)
│   ├── lint-checks.ts      # 534 lines — 7 individual check functions
│   ├── fetch.ts            # 559 lines — URL fetching, HTML conversion
│   ├── query.ts            # 477 lines — search, context building, LLM query
│   ├── embeddings.ts       # 478 lines — vector store, embedding ops
│   ├── search.ts           # 465 lines — BM25 content search, related pages
│   ├── lint-fix.ts         # 458 lines — auto-fix for all 7 lint checks
│   ├── ingest.ts           # 441 lines — ingest pipeline
│   ├── config.ts           # 402 lines — centralized config layer
│   ├── wiki.ts             # 379 lines — filesystem CRUD
│   ├── lifecycle.ts        # 355 lines — write/delete with side effects
│   ├── llm.ts              # 327 lines — multi-provider LLM calls
│   └── ... (21 more)
├── lib/__tests__/          # 30 test files (13,505 lines total)
│   ├── wiki.test.ts        # 1,924 lines — largest test file
│   ├── ingest.test.ts      # 1,610 lines
│   ├── lint.test.ts        # 1,176 lines
│   └── ... (27 more)
└── cli.ts                  # 295 lines — CLI entry point
```

## Open Issues Summary
No open GitHub issues. All 3 historical issues are closed (bootstrap, AI SDK migration, status reporting). The project is currently self-directed by the founding vision.

## Gaps & Opportunities

### Relative to llm-wiki.md vision:
1. **Local image download** — Vision describes downloading article images to `raw/assets/` for offline access and LLM image reading. Currently images are preserved as remote `![alt](url)` references but not downloaded locally.
2. **Dataview-style queries** — Vision mentions using frontmatter for dynamic queries/tables. Frontmatter exists on pages but there's no query interface for it.
3. **Scheduled re-ingestion** — No way to re-fetch a URL to catch updates. Sources are one-shot.
4. **Multi-format output** — Vision mentions Marp slide decks, matplotlib charts, canvas. Only markdown and table formats are supported.
5. **Obsidian plugin** — Export-to-Obsidian exists but there's no real Obsidian plugin for live integration.

### Relative to YOYO.md direction:
6. **E2E/integration tests** — Status report calls this out as Priority 3. No Playwright/Cypress tests exist.
7. **Multi-user / auth** — Listed as an open question. Currently single-user, local-first only.

### Code quality opportunities:
8. **Large components** — `useGraphSimulation.ts` (451 lines), `GlobalSearch.tsx` (356 lines), `WikiIndexClient.tsx` (343 lines), `BatchIngestForm.tsx` (317 lines) could benefit from further decomposition.
9. **Ingest page** (363 lines) and **lint page** (320 lines) are still the two largest pages despite prior decomposition work.
10. **Query re-ranking quality** — Noted as "next" in the journal for ~8 consecutive sessions but never tackled. The current BM25+vector+LLM-rerank pipeline works but hasn't been tuned.

### New capability ideas:
11. **Webhook / API-driven ingest** — Allow external tools to push content into the wiki programmatically.
12. **Page templates / page types** — Different schemas for entity pages, concept pages, comparison pages (the vision mentions these as distinct types).
13. **Source freshness tracking** — Track when sources were last fetched, flag stale ones.

## Bugs / Friction Found
- **No bugs found** — build, lint, and all 1054 tests pass cleanly. No type errors, no eslint warnings.
- **One empty catch** — `locks.set(key, next.catch(() => {}))` in `lock.ts` is intentional (fire-and-forget chain continuation), not a bug.
- **No TODOs/FIXMEs remaining** in source code (only a false positive from `XXX` in a code comment about IPv6 hex format).
- **Test coverage is strong** — only `constants.ts` (static values) and `types.ts` (type-only) lack dedicated test suites, both low-risk.
- **Friction point:** the status report notes the project is in a "founding vision complete" phase — all four pillars work. The main risk is stagnation or over-polishing existing code rather than pushing into genuinely new territory.
