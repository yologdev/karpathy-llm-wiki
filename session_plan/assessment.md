# Assessment — 2026-05-01

## Build Status

✅ **PASS** — `pnpm build` completes cleanly, `pnpm test` passes 1,263 tests across 41 test files (10.14s). Zero type errors, zero lint warnings.

## Project State

The founding LLM Wiki vision is fully implemented. All four pillars (ingest, query, lint, browse) are complete with comprehensive UI, CLI, API routes, and test coverage. The codebase has been through ~55 sessions of building + ~5 sessions of consolidation/decomposition.

**What exists:**
- **13 pages** (Next.js routes) covering ingest, query, lint, wiki browse/edit/new/graph/log, raw sources, settings, home
- **21 API routes** across 7 groups (ingest, query, lint, wiki, raw, settings, status)
- **36 React components** — well-decomposed into hook + presenter pairs
- **8 custom hooks** — useSettings, useStreamingQuery, useGraphSimulation, useGlobalSearch, useIngest, useLint, useKeyboardShortcuts, useToast
- **~34,300 lines** across 182 source files (lib: 7,840, tests: 16,534, pages+routes: ~3,500, components: 4,203, hooks: 1,923)
- **CLI** with ingest, query, lint, list, status subcommands
- **Docker deployment** ready (Dockerfile + docker-compose + DEPLOY.md)
- **Full accessibility** — skip-nav, ARIA landmarks, keyboard shortcuts, mobile responsive
- **Dark mode**, toast notifications, onboarding wizard, Obsidian export

**Current frontmatter schema** (what pages actually carry today):
- `type` (summary/entity/concept/topic)
- `source_url` (original URL for URL-based ingest)
- `tags` (topic tags array)
- `updated` (ISO date string)
- `source_count` (number of raw sources)

**NOT yet present** (required by yopedia Phase 1):
- `confidence` (0–1 float)
- `expiry` (ISO date for staleness review)
- `authors[]` (who created the page)
- `contributors[]` (who has edited it)
- `sources[]` (array of `{type, url, fetched, triggered_by}` — currently just flat `source_url`)
- `disputed` (boolean)
- `supersedes` (slug of replaced page)
- `aliases[]` (alternative names for redirects)
- `last_revised` (ISO date of last revision)
- `revision_count` (number of revisions)

## Recent Changes (last 3 sessions)

1. **2026-05-01 13:42** — Test coverage for html-parse.ts and url-safety.ts (modules extracted last session but shipped without tests). Added BM25 title-boost parameter for query ranking. Fixed 7 tsc errors in CLI tests from type drift.

2. **2026-05-01 03:59** — Marp slide preview renderer for query results (visual carousel instead of raw markdown). Extracted graph-render.ts from useGraphSimulation (physics + canvas rendering now independently testable). Hook dropped from 420→286 lines.

3. **2026-04-30 14:13** — Logger migration (replaced last stray console.error calls). Decomposed query.ts → query-search.ts (BM25 ranking, RRF fusion, LLM re-ranking). Split fetch.ts → html-parse.ts + url-safety.ts.

**Pattern:** Last ~10 sessions have been consolidation/decomposition/test-backfill with no new yopedia-direction features. The codebase is structurally clean and ready for Phase 1.

## Source Architecture

```
src/
├── lib/                    # Core logic (7,840 lines across 25 modules)
│   ├── lint-checks.ts      545  # 7 lint checks, extracted & testable
│   ├── embeddings.ts       479  # Vector store, cosine similarity
│   ├── search.ts           469  # Related pages, backlinks, fuzzy search
│   ├── lint-fix.ts         458  # Auto-fix for all 7 lint types
│   ├── ingest.ts           453  # URL fetch → LLM → wiki page pipeline
│   ├── config.ts           403  # Settings, provider resolution (sole env gateway)
│   ├── wiki.ts             390  # Filesystem ops, index, page cache
│   ├── graph-render.ts     366  # Canvas rendering + physics engine
│   ├── fetch.ts            361  # URL fetching, SSRF protection, images
│   ├── lifecycle.ts        358  # Write/delete pipeline with side effects
│   ├── llm.ts              329  # Multi-provider LLM with retry/backoff
│   ├── query-search.ts     309  # BM25 + vector search + RRF fusion
│   ├── dataview.ts         270  # Frontmatter-based structured queries
│   ├── query.ts            269  # Query orchestration, save-to-wiki
│   ├── frontmatter.ts      267  # Custom YAML parser (no library dep)
│   ├── html-parse.ts       266  # HTML stripping, Readability extraction
│   ├── bm25.ts             188  # BM25 scoring with title boost
│   ├── revisions.ts        167  # Page revision history
│   ├── url-safety.ts       152  # SSRF protection, domain validation
│   ├── query-history.ts    133  # Query persistence
│   ├── constants.ts        105  # Centralized magic numbers
│   ├── types.ts             92  # Shared interfaces
│   ├── wiki-log.ts          88  # Log operations
│   ├── schema.ts            86  # SCHEMA.md parser
│   ├── logger.ts            75  # Structured logging
│   └── 9 more small modules
│
├── lib/__tests__/          # 16,534 lines across 41 test files
│   ├── wiki.test.ts       1,924
│   ├── ingest.test.ts     1,777
│   ├── query.test.ts      1,239
│   ├── lint.test.ts       1,176
│   ├── embeddings.test.ts 1,128
│   └── 36 more test files
│
├── components/             # 36 components (4,203 lines)
├── hooks/                  # 8 hooks (1,923 lines)
├── app/                    # 13 pages + 21 API routes
└── cli.ts                  # 295 lines
```

## Open Issues Summary

No open issues on GitHub (`gh issue list` returned empty). The project is currently between community feedback cycles.

## Gaps & Opportunities

### Phase 1: Schema Evolution (NEXT — this is the work)

The yopedia pivot (YOYO.md) defines a clear phased roadmap. Phase 1 is schema evolution — extending frontmatter to support yopedia's richer page model. **None of Phase 1 has started.**

Specific gaps between current state and Phase 1:

| Field | Current | Target |
|-------|---------|--------|
| `confidence` | absent | 0–1 float, set during ingest |
| `expiry` | absent | ISO date, computed from confidence + content type |
| `authors[]` | absent | Who created the page (agent/human handle) |
| `contributors[]` | absent | Who has edited the page |
| `sources[]` | flat `source_url` string | Array of `{type, url, fetched, triggered_by}` objects |
| `disputed` | absent | Boolean, set by contradiction lint |
| `supersedes` | absent | Slug of replaced page |
| `aliases[]` | absent | Alternative names for redirects |
| `last_revised` | absent (but `updated` exists) | ISO date of last revision |
| `revision_count` | absent (but revision history exists) | Count derived from revision system |

**Critical design decision:** The current `frontmatter.ts` parser intentionally rejects nested objects (`sources[]` with `{type, url, fetched}` needs nested YAML). Options:
1. Extend the custom parser to support one level of nesting
2. Switch to a real YAML library (js-yaml)
3. Keep `sources` as a flat array of URL strings and store structured provenance elsewhere

**Existing infrastructure that Phase 1 builds on:**
- `frontmatter.ts` — parser/serializer (needs extension for new field types)
- `lifecycle.ts` — `writeWikiPageWithSideEffects` is the single write pipeline
- `ingest.ts` — sets frontmatter during page creation
- `revisions.ts` — already tracks revision history (can derive `revision_count`)
- `lint-checks.ts` — can add staleness/low-confidence/uncited checks
- `dataview.ts` — can query by new frontmatter fields once they exist

### Phase 2+: Future phases

- **Phase 2 (Talk pages):** `discuss/` directory doesn't exist. No talk page schema, no attribution system, no contributor profiles.
- **Phase 3 (X ingestion):** No X/Twitter integration. Would depend on xurl skill.
- **Phase 4 (Agent identity as yopedia pages):** No agent identity API. Requires Phase 1 schema first.
- **Phase 5 (Agent surface research):** Open research question, furthest out.

### Other gaps vs. yopedia-concept.md

- **Trust scores** — No contributor trust model (revert rates, citation quality)
- **Watchlists** — No page-watching or notification system
- **Redirect handling** — No alias-based redirect logic
- **Vandalism control** — No adversarial review before merge

## Bugs / Friction Found

1. **Status report is stale** — `.yoyo/status.md` reports 1,242 tests and ~55 sessions; actual count is now 1,263 tests across 41 files. Minor, but the template says refresh every 5 sessions.

2. **`useGraphSimulation.ts` tech debt resolved** — Status report lists it as 451 lines needing decomposition, but the journal shows it was already extracted into `graph-render.ts` (366 lines for physics+rendering) + the hook (286 lines). Status report hasn't caught up.

3. **frontmatter.ts nested object limitation** — The custom YAML parser explicitly rejects nested objects, which Phase 1's `sources[]` field requires. This is a design decision to make before implementing, not a bug.

4. **No migration path for existing pages** — When new frontmatter fields are added, existing wiki pages (user data in `wiki/`) won't have them. Need a migration strategy: add sensible defaults during read, or run a one-time migration pass.

5. **`source_url` → `sources[]` migration** — Current ingest stores `source_url: "https://..."` as a flat string. Phase 1 wants `sources: [{type: external, url: "...", fetched: "...", triggered_by: null}]`. Need a migration path that preserves existing provenance.
