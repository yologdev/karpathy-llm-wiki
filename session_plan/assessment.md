# Assessment — 2026-05-02

## Build Status

✅ **PASS** — `pnpm build` succeeds (Next.js 15 production build), `pnpm test` passes **1,362 tests across 44 test files** in ~10s. Zero type errors. Zero lint warnings.

## Project State

All four founding LLM Wiki pillars are complete and mature. The yopedia pivot is mid-flight:

| Phase | Status | What's Done |
|-------|--------|------------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, authors, contributors, disputed, supersedes, aliases, sources[]), ingest pipeline populates all fields, 3 new lint checks (stale-page, low-confidence, unmigrated-page) with auto-fix, SCHEMA.md updated, source provenance badges in page view |
| **Phase 2: Talk pages + attribution** | 🟡 ~85% | Talk page data layer (`talk.ts`), API routes (CRUD), `DiscussionPanel` UI with thread creation/comments/resolution, revision author attribution, contributor profiles (`contributors.ts`) with trust scores, `ContributorBadge` with trust dot, `AuthorBadges` on page view, API routes for contributor lookup |
| **Phase 3: X ingestion loop** | ⬜ Not started | `x-mention` source type exists in schema/types but no ingestion loop |
| **Phase 4: Agent identity** | ⬜ Not started | No `/api/agent/:id/context`, no scoped search |
| **Phase 5: Agent surface research** | ⬜ Not started | No structured claims or fact triples |

### What exists across the full codebase

- **196 source files** (~37,870 lines of TypeScript/TSX)
- **26 API routes**, **13 pages**, **37 components**, **8 custom hooks**
- **44 test files** (1,362 tests) — coverage spans all core lib modules
- **CLI** with ingest, query, lint, list, status subcommands
- **Docker** deployment with compose, volume mounts, DEPLOY.md
- **Dark mode**, keyboard shortcuts, toast notifications, onboarding wizard
- **BM25 + optional vector search** with RRF fusion, LLM re-ranking
- **Global search**, dataview queries, graph view with clustering, Obsidian export

## Recent Changes (last 3 sessions)

All three sessions today (2026-05-02) drove Phase 2 from foundation to near-complete:

1. **Session 3 (12:56)** — Built `contributors.ts` (profile aggregation from revisions + talk threads), wired API routes (`/api/contributors`, `/api/contributors/[handle]`), added `ContributorBadge` UI component with trust dot coloring. Fixed `fixOrphanPage` missing author attribution. Added `discuss/` to `.gitignore`.

2. **Session 2 (09:00)** — Built `DiscussionPanel` client component (thread create, comment post, resolution toggle), integrated as tab on wiki page view. Extended revision system with author attribution so every revision records who changed it.

3. **Session 1 (06:03)** — Closed Phase 1 with `unmigrated-page` lint check + auto-fix. Crossed into Phase 2: built `talk.ts` data layer (createThread, addComment, resolveThread) and API routes for thread CRUD under `/api/wiki/[slug]/discuss/`.

## Source Architecture

### Core library (`src/lib/` — 8,802 lines, 26 modules)

| Module | Lines | Purpose |
|--------|------:|---------|
| lint-checks.ts | 650 | 10 lint check implementations |
| lint-fix.ts | 570 | Auto-fix handlers for all lint checks |
| ingest.ts | 534 | URL/text ingestion with LLM summarization |
| embeddings.ts | 479 | Provider-agnostic vector store |
| search.ts | 469 | BM25 + fuzzy search + related pages |
| config.ts | 403 | Multi-source config (env, file, defaults) |
| wiki.ts | 393 | Core filesystem ops, page cache, index |
| lifecycle.ts | 374 | Write/delete with side effects |
| graph-render.ts | 366 | Canvas rendering + physics engine |
| fetch.ts | 361 | URL fetch with SSRF protection |
| llm.ts | 329 | Multi-provider LLM with retry |
| query-search.ts | 309 | BM25 ranking, RRF fusion, re-ranking |
| frontmatter.ts | 297 | YAML frontmatter parse/serialize |
| dataview.ts | 270 | Frontmatter query engine |
| query.ts | 269 | Query orchestration + save-to-wiki |
| html-parse.ts | 266 | HTML→markdown conversion |
| talk.ts | 210 | Talk page thread CRUD |
| contributors.ts | 199 | Contributor profile aggregation |
| revisions.ts | 195 | Revision history storage |

### Tests (`src/lib/__tests__/` — 17,993 lines, 44 files)
Comprehensive coverage. Largest suites: ingest (2,001), wiki (1,924), query (1,239), lint (1,177), embeddings (1,128).

### Components (`src/components/` — 4,673 lines, 37 files)
Well-decomposed after systematic extraction campaign (sessions 46–52). Largest: DiscussionPanel (328), BatchIngestForm (258), QueryResultPanel (248).

### Hooks (`src/hooks/` — 1,923 lines, 8 hooks)
All major stateful UI logic extracted into testable hooks.

### Pages + API routes (`src/app/` — ~4,500 lines)
13 page routes, 26 API routes. Every page has error.tsx and loading.tsx.

## Open Issues Summary

No open issues on GitHub (`gh issue list` returned empty). The project is currently issue-free.

## Gaps & Opportunities

### Phase 2 remaining gaps (small)

1. **No contributor profile page** — API routes exist (`/api/contributors/[handle]`) but there's no UI page at e.g. `/wiki/contributors` or `/wiki/contributors/[handle]` to browse contributor profiles. The `ContributorBadge` shows inline trust dots but doesn't link to a detail view.

2. **Revert rate not tracked** — `ContributorProfile` has a `trustScore` based on `(editCount + commentCount) / 50` — a placeholder heuristic. The yopedia-concept.md specifies trust scores based on "revert rates, contradiction rates, and external citation." No revert detection exists yet.

3. **No SourceBadge component for wiki provenance** — The existing `SourceBadge.tsx` is for settings provenance (env/config/default). Wiki page source provenance badges are rendered inline in the page view via `sourceTypeBadge()` function, not extracted into a reusable component.

### Phase 3 readiness

The `x-mention` source type already exists in the type system and the `SourceEntry` interface has `triggered_by`. The `SourceBadge`-style rendering handles it. What's missing:
- No X API integration or polling loop
- No webhook/mention detection
- No research→write pipeline triggered by mentions
- The `x-research` skill exists in yoyo's toolkit but isn't wired into yopedia

### Phase 4 readiness

No infrastructure exists yet. This phase requires:
- Agent identity pages (yoyo's learnings/personality as wiki pages)
- `/api/agent/:id/context` endpoint
- Scoped search (`?scope=agent:yoyo`)
- grow.sh integration

### Structural observations

- **Status report is stale** — `.yoyo/status.md` says 1,242 tests and ~33,600 lines. Reality: 1,362 tests and ~37,870 lines. 120 tests and 4,270 lines added since last refresh.
- **SourceBadge naming collision** — `SourceBadge.tsx` is about settings provenance, not wiki source provenance. This could confuse future development.
- **Trust score is a placeholder** — The heuristic `min(1, (editCount + commentCount) / 50)` doesn't incorporate revert rate, contradiction rate, or external citation quality. Fine for now but should be noted.

## Bugs / Friction Found

No bugs found. Build is clean, all 1,362 tests pass, no type errors. The codebase is in excellent shape after 55+ sessions of incremental hardening.

Minor friction:
- The `SourceBadge.tsx` component name is misleading (it's for settings, not wiki sources).
- The status report metrics are outdated by ~120 tests.
- Contributor profiles have no browsable UI page despite having API routes and inline badges.
