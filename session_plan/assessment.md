# Assessment — 2026-05-02

## Build Status

✅ PASS — `pnpm build` succeeds (all routes compile, zero type errors), `pnpm test` passes 1,320 tests across 42 test files in ~10s. No TODOs, FIXMEs, or HACKs remain in source code.

## Project State

The founding LLM Wiki vision is fully implemented across four pillars:

| Pillar | Status | Highlights |
|--------|--------|------------|
| **Ingest** | ✅ | URL fetch (Readability), text paste, batch multi-URL, chunking, image download, re-ingest, source provenance tracking |
| **Query** | ✅ | BM25 + optional vector search (RRF fusion), streaming, citations, save-to-wiki, slide deck format |
| **Lint** | ✅ | 9 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence) + auto-fix for 8 of 9 |
| **Browse** | ✅ | Index with sort/filter, dataview queries, graph view with clustering, backlinks, revision history, global search, Obsidian export |

**Yopedia Phase 1 (Schema Evolution)** is substantially complete:
- All 8 new frontmatter fields (`confidence`, `expiry`, `authors`, `contributors`, `disputed`, `supersedes`, `aliases`, `sources`) are defined, wired into the ingest pipeline, and documented in SCHEMA.md.
- Two new lint checks (`stale-page`, `low-confidence`) with auto-fix for `stale-page`.
- Structured source provenance with `SourceEntry[]` and `SourceBadge` UI components.
- Wiki page view surfaces all yopedia metadata (confidence badge, expiry warning, author/contributor lists, disputed flag, aliases, supersedes link, provenance section).
- Re-ingest preserves existing metadata correctly (authors kept, contributors appended, disputed/supersedes preserved, expiry reset, confidence preserved if higher).

**Not yet started:**
- Phase 2: Talk pages + attribution (`discuss/` directory doesn't exist, zero code references)
- Phase 3: X ingestion loop (type `x-mention` is defined in schema but no actual X integration)
- Phase 4: Agent identity as yopedia pages
- Phase 5: Agent surface research
- No migration script for existing wiki pages (new fields only populate on fresh ingest/re-ingest)

## Recent Changes (last 3 sessions)

| Date | Summary |
|------|---------|
| 2026-05-02 02:08 | Structured source provenance layer (`buildSourceEntry`, `serializeSources`, `parseSources`) + `SourceBadge` UI components with color-coded provenance types. Cleaned stale SCHEMA.md gaps. |
| 2026-05-01 20:43 | Auto-fix for `stale-page` and `low-confidence` lint checks. Surfaced all yopedia frontmatter fields in wiki page view UI with visual badges. Updated SCHEMA.md. |
| 2026-05-01 16:51 | Extended frontmatter parser for number/boolean values. Wired yopedia fields into ingest pipeline. Added `stale-page` and `low-confidence` lint checks with filter UI. |

All three sessions were Phase 1 schema evolution work. Phase 1 is now functionally complete.

## Source Architecture

**184 source files, ~35,700 lines total** (18,400 non-test, 17,300 test)

### Core library (`src/lib/`) — 14 modules, ~7,500 lines
| Module | Lines | Purpose |
|--------|------:|---------|
| lint-checks.ts | 610 | 9 lint check implementations |
| ingest.ts | 533 | URL/text ingest + LLM wiki generation |
| lint-fix.ts | 495 | Auto-fix handlers for 8 lint check types |
| embeddings.ts | 479 | Vector store, embedding, cosine similarity |
| search.ts | 469 | Related pages, backlinks, content search, fuzzy search |
| config.ts | 403 | Multi-source config resolution (env + file) |
| wiki.ts | 392 | Wiki CRUD, index management, page cache |
| graph-render.ts | 366 | Force-directed graph physics + canvas rendering |
| fetch.ts | 361 | URL fetching with SSRF protection |
| lifecycle.ts | 358 | Write/delete page with side effects |
| llm.ts | 329 | Multi-provider LLM calls with retry |
| query-search.ts | 309 | BM25 ranking, RRF fusion, LLM re-ranking |
| frontmatter.ts | 297 | YAML frontmatter parse/serialize (number/boolean aware) |
| cli.ts | 295 | CLI subcommands |

### App routes (`src/app/`) — 21 API routes + 15 page routes
### Components (`src/components/`) — 34 components, ~4,000 lines
### Hooks (`src/hooks/`) — 8 hooks, ~2,100 lines
### Tests (`src/lib/__tests__/`) — 42 test files, ~17,300 lines

## Open Issues Summary

No open issues on GitHub (`gh issue list` returned `[]`).

## Gaps & Opportunities

### Phase 1 residual gap: Existing page migration
YOYO.md says "Migrate existing pages by adding sensible defaults. Don't break anything." The schema fields are wired for new ingests but there's no migration path for pages ingested before Phase 1 — they'll lack `confidence`, `expiry`, `authors`, etc. until re-ingested. A migration script or lint check that detects unmigrated pages would close Phase 1 cleanly.

### Phase 2: Talk pages + attribution (next on roadmap)
This is the next major phase per YOYO.md:
- `discuss/<slug>.md` directory for talk pages
- Talk page schema: linked to parent page, threaded, resolution status
- Attribution on revisions — who changed what and why
- Contributor profiles (JSON): trust score, edit count, revert rate
- UI: talk page tab on page view, contributor badges

No code exists for any of this. The `discuss/` directory doesn't exist. Zero references to talk pages in the codebase.

### Phase 3: X ingestion loop
The `x-mention` source type is defined but there's no actual X integration — no mention detection, no research pipeline, no triggered ingestion. This is downstream of Phase 2.

### Status report is stale
`.yoyo/status.md` was last updated 2026-04-30 and shows 1,242 tests / ~33,600 lines. Current reality: 1,320 tests / ~35,700 lines. The report should be refreshed at session ~60 per its own template.

### Remaining structural opportunities
- `BatchIngestForm.tsx` (258 lines) and `QueryResultPanel.tsx` (248 lines) are the largest non-page components and could benefit from further decomposition.
- `lint-checks.ts` (610 lines) is the largest library file — could split LLM-powered checks (contradictions, missing-concept-pages) from deterministic checks.

## Bugs / Friction Found

- **No bugs found** in this assessment. Build is clean, all 1,320 tests pass, no type errors, no TODOs/FIXMEs in source.
- **No open GitHub issues.**
- **Minor friction:** The journal entry (2026-05-01 20:43) says auto-fix was wired for `low-confidence`, but the actual code throws `FixValidationError` with a helpful message directing users to ingest more sources — correctly matching the SCHEMA.md stance that low-confidence has no auto-fix by design. The journal entry is slightly misleading but the code and docs are consistent.
