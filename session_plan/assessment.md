# Assessment — 2026-05-02

## Build Status

**Pass.** `pnpm build` succeeds (Next.js 15 production build, all routes compile). `pnpm test` passes — **43 test files, 1,352 tests, 0 failures** (10.99s).

## Project State

yopedia is a fully functional wiki application with a rich feature set. The founding LLM Wiki pattern (ingest, query, lint, browse) is complete and has been extended significantly. The project is now mid-Phase 2 of the yopedia pivot.

**Completed (Phase 1 — Schema evolution):**
- Extended frontmatter: `confidence`, `expiry`, `authors[]`, `contributors[]`, `sources[]`, `disputed`, `supersedes`, `aliases[]`
- Structured source provenance (`SourceEntry` with type/url/fetched/triggered_by) with round-trip serialization
- Three new lint checks: `stale-page`, `low-confidence`, `unmigrated-page` — all with auto-fix
- Provenance badges (SourceBadge) and yopedia metadata badges (confidence, expiry, authors, disputed) in page view UI
- SCHEMA.md updated as single source of truth
- Ingest pipeline populates all new fields from day one

**In progress (Phase 2 — Talk pages + attribution):**
- ✅ Talk page data layer (`talk.ts`: createThread, addComment, resolveThread, deleteDiscussions) — 210 lines, 20 tests
- ✅ Talk page API routes: 3 endpoints under `/api/wiki/[slug]/discuss/`
- ✅ DiscussionPanel UI component (328 lines) — integrated as tab on wiki page view
- ✅ Revision author attribution — revisions carry optional `author` field with JSON sidecar
- ✅ Author display in RevisionItem component
- ❌ Contributor profiles (JSON): trust score, edit count, revert rate — **not started**
- ❌ Contributor badges in UI — **not started**
- ❌ Talk page tab styling/polish — basic but functional

**Not started:**
- Phase 3: X ingestion loop
- Phase 4: Agent identity as yopedia pages (dogfooding)
- Phase 5: Agent surface research

## Recent Changes (last 3 sessions)

1. **2026-05-02 09:00** — Discussion UI and author attribution in revisions. Built DiscussionPanel with thread creation/commenting/resolution. Extended revision system with author attribution. Phase 2 talk pages now work end-to-end.

2. **2026-05-02 06:03** — Phase 1 close-out + Phase 2 foundation. Added `unmigrated-page` lint check with auto-fix. Built talk page data layer and API routes. Crossed the Phase 1→2 boundary.

3. **2026-05-02 02:08** — Structured source provenance and provenance badges. Built `sources[]` data layer with `buildSourceEntry`/`serializeSources`/`parseSources`. Added SourceBadge components to page view. Cleaned SCHEMA.md of stale gap entries.

## Source Architecture

**190 source files, ~37,200 lines of TypeScript/TSX.**

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/lib/` | 39 | Core logic (ingest, query, lint, search, embeddings, talk, revisions, sources, config, etc.) |
| `src/lib/__tests__/` | 43 | Test suites — 1,352 tests total |
| `src/components/` | 38 | React components (DiscussionPanel, WikiEditor, GlobalSearch, etc.) |
| `src/hooks/` | 8 | Custom hooks (useSettings, useIngest, useLint, useStreamingQuery, etc.) |
| `src/app/api/` | 24 routes | REST endpoints for all operations |
| `src/app/` | ~40 | Next.js pages with error boundaries and loading skeletons |

**Key large files:**
- `lint-checks.ts` (650 lines) — 10 lint check implementations
- `lint-fix.ts` (565 lines) — auto-fix handlers for all 10 checks
- `ingest.ts` (533 lines) — URL fetch, text ingest, LLM orchestration
- `embeddings.ts` (479 lines) — vector store with multi-provider embedding
- `search.ts` (469 lines) — BM25, fuzzy search, related pages, backlinks
- `wiki/[slug]/page.tsx` (466 lines) — wiki page view with all badges/tabs

**Infrastructure:**
- Docker deployment (Dockerfile, docker-compose, DEPLOY.md)
- CLI (`cli.ts`, 295 lines) with ingest/query/lint/list/status commands
- Structured logger with configurable levels
- File locking, page caching, SSRF protection

## Open Issues Summary

**No open issues.** The GitHub issue tracker (`gh issue list`) returns an empty array. All previously reported issues have been resolved.

## Gaps & Opportunities

### Phase 2 completion (immediate)
1. **Contributor profiles** — The roadmap specifies "Contributor profiles (JSON): trust score, edit count, revert rate." Nothing exists yet. This is the next natural step — a `contributors.ts` module that maintains per-author stats derived from revision history and talk page activity.
2. **Contributor badges in UI** — Display contributor info (edit count, trust score) in the wiki page view alongside author names. The page view already shows `authors[]` as plain text; badges would make this richer.
3. **Talk page tab polish** — The DiscussionPanel exists but the integration is basic. Thread status indicators, unresolved-count badges on the tab, and sorting by activity would improve usability.

### Phase 2→3 bridge
4. **Attribution trail completeness** — Revisions track author optionally but the ingest pipeline and lint-fix pipeline don't pass author through. Every write-path should attribute who caused the change.
5. **`discuss/` directory on disk** — The talk page data layer uses `discuss/` directory but the directory doesn't exist yet in the repo structure (it's created on-demand). No issue, but worth noting.

### Broader vision gaps
6. **Phase 3 (X ingestion)** — Requires external integration (@yoyo X mentions → research → page creation). The `x-mention` source type is already defined in the schema but no ingestion pipeline exists.
7. **Phase 4 (Agent identity as pages)** — yoyo's identity docs becoming yopedia pages with `GET /api/agent/:id/context`. Not started.
8. **Phase 5 (Agent surface research)** — Structured claims, fact triples, pre-computed embeddings as projection of human wiki. Not started.

### Quality/polish
9. **No integration test for talk pages** — The talk data layer has 20 unit tests but no API-level integration test for the discuss endpoints.
10. **Revision history lacks diffing in the API** — The UI shows diffs via RevisionItem but the API doesn't return diffs — the client fetches full content and diffs client-side. For large pages this is wasteful.

## Bugs / Friction Found

No build errors or test failures. No open bugs. Friction points noted:

1. **`discuss/` directory not in .gitignore** — If talk pages are user-generated content (like `wiki/` and `raw/`), the `discuss/` directory should probably be gitignored. Currently it would be tracked by git if created.
2. **Author attribution is optional everywhere** — The revision system accepts `author?: string` but nothing enforces it. Most code paths (ingest, lint-fix, query-save) don't pass an author, so revision history will accumulate entries with no attribution unless this is wired through.
3. **Trust score has no data source** — The roadmap calls for trust scores based on "revert rate, contradiction rates, and external citation" but revert tracking doesn't exist. Revisions can be restored but there's no concept of a "revert" as a distinct operation that would feed into trust scoring.
