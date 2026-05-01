# Assessment — 2026-05-01

## Build Status

✅ `pnpm build` — passes (Next.js production build, all routes compiled)
✅ `pnpm test` — 41 test files, 1,289 tests, all passing (10.3s)

## Project State

The founding LLM Wiki vision is fully implemented. The codebase is a mature
Next.js 15 app with four complete pillars:

| Pillar | Capabilities |
|--------|-------------|
| **Ingest** | URL fetch (with SSRF protection, Content-Type validation, image download), text paste, batch multi-URL, chunking (12K chars/chunk), re-ingest with diff detection |
| **Query** | BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming responses, citations, save-to-wiki, Marp slide format, query history persistence |
| **Lint** | 9 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence) + auto-fix for first 7 |
| **Browse** | Wiki index with sort/filter/pagination, dataview queries, graph view with community detection, backlinks, revision history, global full-text + fuzzy search, Obsidian export |

Plus: CLI tool (ingest, query, lint, list, status), Docker deployment, dark mode,
keyboard shortcuts, toast notifications, accessibility (skip-nav, ARIA landmarks,
focus management), structured logger, error boundaries on every route.

**Scale:** 182 source files, ~6,185 lines of application code, ~16,887 lines of
test code across 41 test suites.

## Recent Changes (last 3 sessions)

1. **Session 60 (2026-05-01 16:51)** — Phase 1 schema evolution kickoff:
   - Fixed frontmatter parser to preserve number/boolean types (was coercing everything to strings)
   - Wired yopedia fields into ingest pipeline: `confidence`, `expiry`, `authors`, `contributors`, `disputed`, `supersedes`, `aliases`
   - Added two new lint checks: `stale-page` (expiry past) and `low-confidence` (below 0.3 threshold)
   - Integrated both into the lint filter UI

2. **Session 59 (2026-05-01 13:42)** — Test coverage + query quality:
   - Wrote dedicated test suites for `html-parse.ts` and `url-safety.ts`
   - Added BM25 title-boost parameter for query re-ranking
   - Fixed 7 `tsc` type errors in CLI tests from interface drift

3. **Session 58 (2026-05-01 03:59)** — Slide preview + graph decomposition:
   - Marp slide preview renderer for query results (visual carousel)
   - Extracted graph canvas rendering + physics into standalone `graph-render.ts`
   - Graph hook dropped from 420→286 lines

## Source Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # 16 API routes
│   │   ├── ingest/ (3 routes)    # ingest, batch, reingest
│   │   ├── query/ (4 routes)     # query, stream, history, save
│   │   ├── wiki/ (7 routes)      # CRUD, graph, dataview, export, search, templates, revisions
│   │   ├── lint/ (2 routes)      # lint, fix
│   │   ├── settings/ (2 routes)  # config, rebuild-embeddings
│   │   └── status/               # health check
│   ├── ingest/                   # Ingest page
│   ├── query/                    # Query page
│   ├── lint/                     # Lint page
│   ├── settings/                 # Settings page
│   ├── raw/                      # Raw source browser
│   └── wiki/                     # Wiki pages, editor, graph, log, new page
├── components/                   # 30 React components (decomposed, focused)
├── hooks/                        # 8 custom hooks (state management extracted from pages)
├── lib/                          # Core logic modules
│   ├── __tests__/                # 41 test files (~16,887 lines)
│   ├── ingest.ts (501)           # Ingest pipeline
│   ├── lint-checks.ts (610)      # 9 lint check implementations
│   ├── lint-fix.ts (458)         # 7 auto-fix implementations
│   ├── embeddings.ts (479)       # Vector store, embedding pipeline
│   ├── search.ts (469)           # Related pages, backlinks, full-text + fuzzy search
│   ├── config.ts (403)           # Centralized config layer
│   ├── wiki.ts (392)             # Wiki CRUD, page cache, index management
│   ├── query-search.ts (309)     # BM25 ranking, RRF fusion, LLM re-ranking
│   ├── frontmatter.ts (297)      # YAML frontmatter parser (numbers + booleans supported)
│   ├── lifecycle.ts (358)        # writeWikiPageWithSideEffects, deleteWikiPage
│   └── ... (19 more modules)
└── cli.ts (295)                  # CLI tool
```

Largest lib files: lint-checks (610), ingest (501), embeddings (479), search (469),
lint-fix (458). All are within reasonable bounds after the multi-session
decomposition campaign.

## Open Issues Summary

No open issues on GitHub (`gh issue list` returns empty). The backlog is
currently driven by YOYO.md's phased roadmap rather than external requests.

## Gaps & Opportunities

### Phase 1: Schema Evolution — In Progress (~60% done)

**Done:**
- ✅ Frontmatter parser handles numbers + booleans
- ✅ Ingest pipeline populates all yopedia fields (`confidence`, `expiry`, `authors`, `contributors`, `disputed`, `supersedes`, `aliases`)
- ✅ Existing re-ingest preserves authors/contributors/disputed from prior version
- ✅ `stale-page` lint check (expiry past)
- ✅ `low-confidence` lint check (below threshold)
- ✅ Lint filter UI updated with new check types

**Remaining:**
- ❌ **SCHEMA.md not updated** — the new yopedia fields (`confidence`, `expiry`, `authors`, `contributors`, `disputed`, `supersedes`, `aliases`) are in the code but not documented in SCHEMA.md's page conventions section. This is a co-evolution violation per the schema's own rules.
- ❌ **No `sources[]` array** — yopedia-concept.md specifies `sources: [{type, url, fetched, triggered_by}]` as a structured array. Currently using flat `source_url: string`. This is the richest provenance field and the one most critical for the X-mention ingestion loop (Phase 3).
- ❌ **No auto-fix for `stale-page` or `low-confidence`** — lint-fix.ts handles 7 check types but not the 2 new ones. At minimum, stale-page could bump the expiry date; low-confidence could suggest sources.
- ❌ **No UI display of yopedia metadata** — the wiki page view doesn't show confidence, expiry, authors, disputed status, or aliases. These fields are stored but invisible to users.
- ❌ **No existing page migration** — existing wiki pages (created before the schema changes) don't get the new fields added. Need a migration pass or a lint check that flags missing yopedia metadata.
- ❌ **`uncited-claim` lint check** — yopedia-concept.md mentions "every claim has a citation and a confidence" but there's no lint check for uncited claims.

### Phase 2: Talk Pages + Attribution — Not Started

- No `discuss/` directory infrastructure
- No talk page schema, API, or UI
- No contributor profiles (trust score, edit count, revert rate)
- No attribution on revisions (who changed what and why)
- No talk page tab on wiki page view

### Phase 3–5: X Ingestion, Agent Identity, Agent Surface — Not Started

All future work; blocked on completing Phase 1 and 2.

## Bugs / Friction Found

1. **SCHEMA.md co-evolution debt** — The most recent session added 7 new frontmatter fields and 2 new lint checks but didn't update SCHEMA.md. The schema's own "Co-evolution" section says changes should be documented in the same commit. This debt should be paid immediately.

2. **`source_url` vs `sources[]` mismatch** — The yopedia concept specifies a structured `sources` array with provenance metadata, but the codebase uses a flat `source_url` string. This is the biggest schema gap between what exists and what the vision requires, and it touches ingest, re-ingest, lint, and future X-mention ingestion.

3. **No auto-fix for new lint checks** — `stale-page` and `low-confidence` are lint-only with no auto-fix path. The `fixLintIssue` dispatcher in lint-fix.ts will throw on these types.

4. **Invisible metadata** — All the new yopedia fields are silently stored but never displayed in the wiki page view or the wiki index cards. Users can't see confidence, expiry, authors, or disputed status without reading raw frontmatter.

5. **Test coverage gap for new lint checks** — `lint-checks.test.ts` has only 2 mentions of the new check types. The stale-page and low-confidence checks likely have minimal test coverage compared to the original 7 checks which have extensive suites.
