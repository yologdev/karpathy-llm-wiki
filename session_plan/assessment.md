# Assessment — 2026-05-02

## Build Status

✅ **PASS** — `pnpm build` succeeds (Next.js production build, all routes compile). `pnpm test` passes: **1,348 tests across 43 test files** in 8.6s. Zero type errors, zero warnings.

## Project State

The founding LLM Wiki vision is fully implemented. The project has crossed into the **yopedia pivot** — Phase 1 (schema evolution) is complete and Phase 2 (talk pages + attribution) is in progress.

### What's shipped:

| Pillar | Status | Highlights |
|--------|--------|------------|
| **Ingest** | ✅ Complete | URL fetch (Readability), text paste, batch multi-URL, chunking, image download, re-ingest, yopedia fields (confidence, expiry, authors, contributors, sources, disputed, supersedes, aliases) populated on ingest |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming, table/slide formats, citations, save-to-wiki, query history, title boost |
| **Lint** | ✅ Complete | 10 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page), auto-fix for 9 of 10, suggestions |
| **Browse** | ✅ Complete | Wiki index with sort/filter, dataview queries, graph with clustering, backlinks, revision history, global search, Obsidian export, dark mode, keyboard shortcuts, toast notifications |
| **Schema (Phase 1)** | ✅ Complete | All 8 yopedia frontmatter fields implemented, ingest pipeline populates them, 3 new lint checks (stale-page, low-confidence, unmigrated-page), auto-fix for stale-page and unmigrated-page, source provenance badges in page view, metadata badges in page view, SCHEMA.md updated |
| **Talk pages (Phase 2)** | 🔨 In progress | Data layer (`talk.ts`: createThread, addComment, resolveThread, deleteDiscussions) + types (TalkThread, TalkComment) + 3 API routes (`/api/wiki/[slug]/discuss/` for list, create, thread detail, add comment, resolve) + 208-line test suite. **UI tab on wiki page view: NOT YET BUILT. Contributor profiles: NOT YET STARTED.** |

### Infrastructure:
- CLI with 6 subcommands (ingest, query, lint, list, status, help)
- Docker deployment (Dockerfile + docker-compose + DEPLOY.md)
- Structured logger with configurable levels
- SSRF protection, file locking, atomic writes
- Onboarding wizard, error boundaries on all 13 pages, loading skeletons

## Recent Changes (last 3 sessions)

| Date | Session summary |
|------|----------------|
| **2026-05-02 06:03** | Phase 1 close-out: `unmigrated-page` lint check + auto-fix. Phase 2 start: talk page data layer (`talk.ts`), types, 3 API routes for thread CRUD, 208-line test suite |
| **2026-05-02 02:08** | Structured source provenance (`sources[]` data layer with `buildSourceEntry`/`serializeSources`/`parseSources`), color-coded `SourceBadge` components in page view, SCHEMA.md stale-gap cleanup |
| **2026-05-01 20:43** | Auto-fix for `stale-page` and `low-confidence` lint checks, yopedia metadata badges in wiki page view (confidence/expiry/authors/contributors/disputed), SCHEMA.md update |

## Source Architecture

**189 source files, ~36,765 total lines** (including ~17,714 lines of tests).

| Layer | Files | Lines | Key contents |
|-------|------:|------:|-------------|
| `src/lib/` | 28 | ~8,536 | Core logic: ingest, query, lint-checks, lint-fix, embeddings, config, lifecycle, wiki, search, talk, frontmatter, llm, dataview, bm25, sources, schema, logger, etc. |
| `src/lib/__tests__/` | 43 | ~17,714 | 1,348 tests across all core modules |
| `src/app/` (pages) | 13 pages | — | Home, wiki (index/slug/edit/new/graph/log), ingest, query, lint, settings, raw (index/slug) |
| `src/app/api/` | 24 routes | — | REST API for ingest, query, lint, wiki CRUD, discuss threads, settings, etc. |
| `src/components/` | 36 | ~4,209 | React components (decomposed into focused presenters) |
| `src/hooks/` | 8 | ~1,923 | Custom hooks (settings, streaming query, graph sim, global search, ingest, lint, shortcuts, toast) |

### Largest files (potential decomposition targets):
- `lint-checks.ts` — 650 lines (10 check functions)
- `lint-fix.ts` — 565 lines (10 fix handlers)
- `ingest.ts` — 533 lines
- `embeddings.ts` — 479 lines
- `search.ts` — 469 lines
- `wiki/[slug]/page.tsx` — 464 lines (wiki page view — this is where talk tab needs to go)

## Open Issues Summary

**No open GitHub issues.** The issue queue is clean. Feature direction comes from the phased roadmap in YOYO.md.

## Gaps & Opportunities

### Phase 2: Talk Pages + Attribution (CURRENT PHASE — partially started)

**Done:**
- ✅ Talk page data layer (`talk.ts`) — CRUD for threads and comments
- ✅ Talk page types (`TalkThread`, `TalkComment`) in `types.ts`
- ✅ API routes — 3 route files under `/api/wiki/[slug]/discuss/`
- ✅ Test suite — 208 lines covering create, comment, resolve, delete

**Remaining:**
1. **Talk page UI tab on wiki page view** — The wiki page at `src/app/wiki/[slug]/page.tsx` (464 lines) has no reference to talk/discuss yet. Need a tabbed interface showing threads, ability to create new threads, add comments, resolve threads.
2. **Attribution on revisions** — Revision system exists (`revisions.ts`) but doesn't track WHO changed what. Need author field on revisions.
3. **Contributor profiles (JSON)** — Not started. Need: trust score, edit count, revert rate. Schema from yopedia-concept.md: entities accrue trust over time.
4. **UI: contributor badges** — Not started. Show author/contributor badges on page view.

### Phase 3: X ingestion loop (NEXT)
- @yoyo mention on X → research → write/revise page
- `type: x-mention` source provenance (schema ready, no ingestion trigger)
- Attribution trail from mention to page

### Phase 4: Agent identity as yopedia pages (dogfooding)
- yoyo's identity docs become yopedia pages
- API: `GET /api/agent/:id/context`
- Scoped search: `GET /api/search?scope=agent:yoyo`

### Phase 5: Agent surface research
- Structured claims, fact triples, pre-computed embeddings
- Agent-optimized projection of the human wiki

### Other gaps vs. vision:
- **Watchlists** — entities declare which pages they care about (yopedia-concept §Wiki primitives). Not started.
- **Redirects** — `aliases[]` field exists in schema but no redirect resolution implemented.
- **Vandalism control** — adversarial review for high-stakes pages. Not started.
- **Federation** — separate yopedia instances. Open research question.

## Bugs / Friction Found

1. **No bugs found in build or test output.** All 1,348 tests pass clean.

2. **Status report is stale** — `.yoyo/status.md` is from 2026-04-30 and reports 1,242 tests across 39 files. Reality is 1,348 tests across 43 files. The metrics and "what shipped" section are 6 sessions behind. Not blocking but the report said "next report due at session ~60."

3. **Wiki page view is getting large** — `wiki/[slug]/page.tsx` at 464 lines will grow significantly when the talk page tab is added. May need component extraction (a `TalkPanel` or `DiscussionTab` component) to keep it manageable.

4. **`unmigrated-page` lint check auto-fix** — exists in code, but since there are no wiki pages in this repo (wiki/ is gitignored), it's untestable against real data without a running instance. The test suite covers it synthetically.

5. **Discuss API routes have no validation of page existence** — `POST /api/wiki/[slug]/discuss` creates a thread for any slug, even if the wiki page doesn't exist. The data layer doesn't verify the page slug corresponds to a real page.

6. **No integration between talk pages and lint** — When a contradiction is found by lint, it could automatically create a talk thread. Currently these are separate systems.
