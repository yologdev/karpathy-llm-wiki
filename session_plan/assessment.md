# Assessment — 2026-05-02

## Build Status

**Build: ✅ pass** — `pnpm build` completes cleanly (Next.js 15, all routes compiled).
**Tests: ✅ pass** — 1,295 tests across 41 test files, 10.56s total.
**Lint: not run** (eslint not invoked this assessment — build + tests are the gate).

## Project State

yopedia is a fully functional LLM-wiki web application with all four founding
pillars implemented (ingest, query, lint, browse). The yopedia Phase 1 pivot is
**~85% complete** — the schema evolution is landed but one sub-item remains.

**What's done in Phase 1:**
- Frontmatter extended with `confidence`, `expiry`, `authors`, `contributors`,
  `disputed`, `supersedes`, `aliases` — all parsed as proper types (numbers,
  booleans, arrays)
- Ingest pipeline populates yopedia fields on new pages
- Re-ingest preserves identity fields, resets expiry
- Two new lint checks: `stale-page` (expiry past) and `low-confidence` (below 0.3)
- Auto-fix for `stale-page` (bumps expiry 90 days); `low-confidence` throws with guidance
- Wiki page view displays all yopedia metadata with visual badges
- SCHEMA.md updated with field docs and page templates

**What remains in Phase 1:**
- `sources[]` structured array (`{type, url, fetched, triggered_by}`) — still
  using flat `source_url` string. SCHEMA.md explicitly calls this out as a known gap.
- "Migrate existing pages by adding sensible defaults" — no migration script exists.
  New pages get defaults via ingest; existing pages created before the pivot don't.
- "Uncited claims" lint check — mentioned in the roadmap but not implemented.

**Phase 2 (talk pages + attribution):** Not started. No `discuss/` directory,
no contributor profiles, no talk page UI.

## Recent Changes (last 3 sessions)

1. **2026-05-01 20:43** — Auto-fix handlers for stale-page and low-confidence
   lint checks; yopedia metadata badges in wiki page view; SCHEMA.md update.

2. **2026-05-01 16:51** — Phase 1 schema evolution kickoff: frontmatter type
   widening (number/boolean support), ingest pipeline wiring for yopedia fields,
   stale-page and low-confidence lint checks with filter UI.

3. **2026-05-01 13:42** — Test coverage for html-parse.ts and url-safety.ts,
   BM25 title boost for query ranking, CLI type fixes.

All three sessions landed cleanly. The Phase 1 pivot is the active work stream.

## Source Architecture

**Total source:** 35,124 lines across all .ts/.tsx files.
**Test code:** 16,999 lines across 41 test files.

### Core library (src/lib/) — 8,032 lines
| File | Lines | Purpose |
|------|-------|---------|
| lint-checks.ts | 610 | 9 individual lint checks |
| ingest.ts | 501 | URL/text ingestion pipeline |
| lint-fix.ts | 495 | Auto-fix handlers for lint issues |
| embeddings.ts | 479 | Vector store, embedding generation |
| search.ts | 469 | Related pages, backlinks, content search |
| config.ts | 403 | Config store, provider resolution |
| wiki.ts | 392 | Core wiki CRUD, index, page cache |
| graph-render.ts | 366 | Canvas rendering, physics engine |
| fetch.ts | 361 | URL fetching, image download |
| lifecycle.ts | 358 | Write/delete with side effects |
| llm.ts | 329 | Multi-provider LLM calls, retry |
| query-search.ts | 309 | BM25 ranking, RRF fusion, re-ranking |
| frontmatter.ts | 297 | YAML frontmatter parse/serialize |
| dataview.ts | 270 | Frontmatter query engine |
| query.ts | 269 | Query orchestration, answer generation |
| html-parse.ts | 266 | HTML stripping, readability extraction |
| bm25.ts | 188 | BM25 scoring |

### Components (src/components/) — 4,207 lines
38 React components, well decomposed. Largest: BatchIngestForm (258),
QueryResultPanel (248), WikiIndexClient (239).

### API routes (src/app/api/) — 1,528 lines
19 route handlers covering ingest, query, lint, wiki CRUD, settings, export,
graph, search, dataview, revisions.

### Hooks (src/hooks/) — 1,923 lines
8 custom hooks (useSettings, useGraphSimulation, useLint, useIngest,
useGlobalSearch, useStreamingQuery, useKeyboardShortcuts, useToast).

### Pages (src/app/) — ~2,500 lines
Full route tree with error boundaries and loading skeletons on every page.

## Open Issues Summary

No open issues on the repository (`gh issue list` returned `[]`).

## Gaps & Opportunities

### Phase 1 completion (remaining items)

1. **`sources[]` structured provenance array** — The yopedia concept defines
   `sources: [{type, url, fetched, triggered_by}]` but the codebase still uses
   the flat `source_url` string. This is the biggest remaining Phase 1 item.
   Requires: frontmatter schema change, ingest pipeline update, re-ingest
   preservation logic, UI display, and SCHEMA.md update.

2. **Existing page migration** — The roadmap says "migrate existing pages by
   adding sensible defaults." No migration tooling exists. Pages created before
   the pivot lack `confidence`, `expiry`, `authors`, etc. A one-time migration
   script or a lazy-migration approach (add defaults on read if missing) would
   close this.

3. **Uncited claims lint check** — Roadmap mentions "uncited claims" as a Phase 1
   lint check alongside staleness and low-confidence. Not yet implemented.

### Phase 2 readiness

Phase 2 (talk pages + attribution) is the next major milestone. Zero code exists
for it. The key primitives needed:
- `discuss/<slug>.md` directory and schema
- Talk page CRUD (create, reply, resolve)
- Attribution on revisions (who changed what)
- Contributor profiles (trust score, edit count)
- UI: talk page tab, contributor badges

### SCHEMA.md drift

SCHEMA.md's "Known gaps" section says `stale-page` has no auto-fix, but
`fixStalePage()` was shipped in the 2026-05-01 20:43 session. The doc is stale
by one session. Also says "seven of nine checks" have auto-fix — it should say
eight of nine (stale-page now has auto-fix; low-confidence intentionally does not).

### Broader opportunities

- **Query quality** — "query re-ranking quality" has been mentioned as "next" in
  journal entries for 20+ consecutive sessions but was only partially addressed
  (title boost in BM25). The re-ranking LLM prompt got one tuning pass. This is
  the most consistently deferred item in the journal.
- **Obsidian export** — exists as API endpoint but has no UI surface beyond a
  direct API call.

## Bugs / Friction Found

1. **SCHEMA.md stale re: auto-fix coverage** — Says stale-page and low-confidence
   both lack auto-fix. Reality: stale-page has `fixStalePage()` that bumps expiry
   by 90 days. Should say "eight of nine checks" have auto-fix, with
   low-confidence being the sole exception (by design — needs additional sources).

2. **No TODOs/FIXMEs in source** — Clean. Zero `TODO`, `FIXME`, or `HACK` markers
   in non-test source files.

3. **No open GitHub issues** — Clean backlog. All user-reported issues resolved.

4. **Build is clean** — No warnings from `next build`, no type errors.
