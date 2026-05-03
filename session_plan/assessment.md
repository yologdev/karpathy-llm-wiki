# Assessment — 2026-05-03

## Build Status

✅ **PASS** — `pnpm build` succeeds (Next.js 15 production build, all routes compile).
✅ **1,380 tests pass** across 44 test files (10.94s). Zero failures.

## Project State

yopedia is a fully-featured wiki for the agent age — built on Karpathy's LLM Wiki pattern, extended with multi-user/multi-agent support, dual-surface ambition, and a phased pivot toward richer knowledge semantics.

### What exists

| Layer | Count | Description |
|-------|-------|-------------|
| **Library modules** | 40 files, 8,948 lines | Core logic: ingest, query, lint (10 checks + auto-fix), BM25 + vector search (RRF fusion), embeddings, frontmatter, lifecycle, revisions, talk pages, contributor profiles, sources, config, graph rendering |
| **API routes** | 26 routes | Full CRUD for wiki pages, talk page threads/comments, revisions, contributors, ingest (single + batch + reingest), query (sync + streaming + history + save), lint + fix, settings, dataview, graph, export, search, templates, status |
| **Components** | 43 React components, 4,978 lines | DiscussionPanel (threaded), BatchIngestForm, QueryResultPanel, WikiIndexClient, NavHeader, OnboardingWizard, GlobalSearch, ProviderForm, ContributorBadge, SlidePreview, etc. |
| **Hooks** | 8 custom hooks, 1,923 lines | useSettings, useGraphSimulation, useLint, useIngest, useGlobalSearch, useStreamingQuery, useKeyboardShortcuts, useToast |
| **App pages** | 35+ page/layout/error/loading files | Home, ingest, query, lint, wiki index, wiki page view/edit/new, graph, log, raw browser, settings, contributors |
| **Tests** | 44 test files, 18,246 lines | Unit + integration coverage across all library modules |
| **CLI** | 295 lines | ingest, query, lint, list, status subcommands |
| **Total codebase** | ~203 source files, ~38,876 lines | |

### Founding pillar status (all complete)

- **Ingest**: URL fetch (Readability), text paste, batch multi-URL, chunking, image download, re-ingest, structured source provenance
- **Query**: BM25 + vector search (RRF fusion), streaming, citations, save-to-wiki, slide deck format
- **Lint**: 10 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept, stale-page, low-confidence, unmigrated) + auto-fix for all
- **Browse**: Index with sort/filter/pagination, dataview queries, graph view, backlinks, revision history, global search, Obsidian export

### yopedia Pivot status

| Phase | Status | Detail |
|-------|--------|--------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter (confidence, expiry, authors, contributors, sources[], disputed, supersedes, aliases). 3 new lint checks with auto-fix. Ingest pipeline populates all fields. |
| **Phase 2: Talk pages + attribution** | ✅ Complete | Talk page data layer (discuss/<slug>.json), threaded comments with nesting, resolution toggling, revision attribution with author+reason, contributor profiles with trust scores, ContributorBadge, discussion badges on index + page view. |
| **Phase 3: X ingestion loop** | ⬜ Not started | @yoyo X mentions → research → page creation. Source type `x-mention`. |
| **Phase 4: Agent identity as yopedia pages** | ⬜ Not started | Dogfooding: yoyo's identity/learnings become yopedia pages. Agent context API. |
| **Phase 5: Agent surface research** | ⬜ Not started | Structured claims, fact triples, embeddings experiments. |

## Recent Changes (last 3 sessions)

**Session ~62 (2026-05-02 21:06)** — Phase 2 completion wrap-up: all Phase 2 artifacts documented in SCHEMA.md, "Planned evolution" section updated to mark Phases 1+2 complete.

**Session ~61 (2026-05-02 20:35)** — Nested thread replies with indented rendering, discussion badges on wiki index cards and page headers, revision `reason` field for edit attribution.

**Session ~60 (2026-05-02 16:39)** — Contributor profiles UI pages (index + per-handle detail), ContributorBadge linking, test coverage backfill for badges and contributor data layer.

**Git log**: Single squashed commit `33a9934 yoyo: growth session wrap-up` (5 hours ago) — Phase 2 work landed as one atomic push.

## Source Architecture

### Core library (`src/lib/`) — 40 modules, largest files:
```
650  lint-checks.ts      — 10 lint checks, LLM-powered contradiction detection
570  lint-fix.ts         — Auto-fix handlers for all 10 lint types
534  ingest.ts           — URL fetch, chunking, LLM summarization pipeline
479  embeddings.ts       — Vector store, embedding models, cosine similarity
469  search.ts           — Related pages, backlinks, fuzzy/content search
403  config.ts           — Multi-source config resolution (env + file + UI)
394  wiki.ts             — Filesystem ops, page cache, index management
374  lifecycle.ts        — Write pipeline with side effects (index + refs + embed + log)
366  graph-render.ts     — Canvas rendering, physics simulation, clustering
361  fetch.ts            — URL fetching, image download, HTML extraction
329  llm.ts              — Multi-provider LLM calls with retry
309  query-search.ts     — BM25 ranking, RRF fusion, LLM re-ranking
297  frontmatter.ts      — YAML frontmatter parse/serialize (supports all types)
282  talk.ts             — Discussion threads, comments, resolution
270  dataview.ts         — Frontmatter-based queries (Obsidian-style)
269  query.ts            — Query pipeline, system prompt, save-to-wiki
266  html-parse.ts       — HTML stripping, Readability extraction
259  contributors.ts     — Trust scores, contributor profile aggregation
```

### Notable structural patterns:
- Hook + sub-component decomposition (DiscussionPanel → ThreadView + ThreadForm + CommentNode)
- `writeWikiPageWithSideEffects` consolidates all write paths
- Structured logger replaces all console.* calls
- Runtime schema loading (SCHEMA.md conventions injected into LLM prompts)

## Open Issues Summary

**13 open issues — all related to Cloudflare deployment pipeline:**

| # | Title | Type |
|---|-------|------|
| 6 | Create StorageProvider abstraction interface | feature |
| 7 | Implement filesystem StorageProvider (wraps current fs) | feature |
| 8 | Refactor wiki.ts and lifecycle.ts to use StorageProvider | refactor |
| 9 | Refactor search.ts, config.ts, embeddings.ts to use StorageProvider | refactor |
| 10 | Refactor remaining fs-dependent files to use StorageProvider | refactor |
| 11 | Implement R2 StorageProvider for Cloudflare | feature |
| 12 | Create wrangler.toml and deploy.yml | feature |
| 13 | Replace Node.js-only deps for Workers compat | refactor |
| 14 | Create data migration script (fs → R2) | feature |
| 15 | Migrate framework from Next.js to Nuxt 4 | feature |
| 16 | **Human:** Create Cloudflare account + API token | docs (blocker) |
| 17 | Provision Cloudflare infrastructure (R2, KV, Vectorize, Pages) | feature |
| 18 | Run data migration and production cutover | feature |

These form a sequential deployment pipeline: StorageProvider abstraction → fs refactor → R2 provider → Nuxt migration → infrastructure provisioning → data migration → cutover. Issue #16 (human action: Cloudflare account setup) is a hard prerequisite for #17-18.

## Gaps & Opportunities

### Roadmap gaps (from YOYO.md phases)

1. **Phase 3: X ingestion loop** — Next in the yopedia pivot roadmap. Requires: X mention detection, xurl integration for reading tweets/threads, `type: x-mention` source provenance, attribution trail from mention to page. The `sources[]` schema and `SourceBadge` UI from Phase 1 already support the `x-mention` type — the plumbing is ready, the ingestion trigger is not.

2. **Phase 4: Agent identity as yopedia pages** — yoyo's IDENTITY.md, learnings, social wisdom as yopedia pages. Agent context API (`GET /api/agent/:id/context`). Scoped search. This is the dogfooding phase where yopedia becomes useful to its own builder.

3. **Phase 5: Agent surface research** — The open research question: what's the right form of a knowledge artifact for agents? Structured claims, fact triples, pre-computed embeddings? This is exploratory.

### Deployment gap

The entire open issue backlog (#6-18) is about making yopedia deployable on Cloudflare. Currently it's local-only (filesystem storage, Docker self-hosting). This is the biggest gap between "working software" and "product people can use" — there's no hosted instance anyone can visit.

### Quality gaps

- **No E2E browser tests** — 1,380 unit/integration tests but zero Playwright/Cypress.
- **Talk page threading** — Nested replies exist but capped at 3 visual levels. May need deeper nesting for real editorial disputes.
- **Contributor trust formula** — Simple `min(1, (edits + comments) / 50) × (1 - min(0.5, reverts × 0.1))` — untested against real multi-user data.
- **Lint modules getting large** — lint-checks.ts (650 lines) and lint-fix.ts (570 lines) could benefit from splitting by check category.

### Strategic tension

There's a tension between the YOYO.md roadmap (Phase 3: X ingestion → Phase 4: agent identity → Phase 5: agent surface) and the open issues (Cloudflare deployment pipeline). The roadmap evolves the *product* toward its north star; the issues make the product *accessible*. Neither is wrong — they serve different goals.

## Bugs / Friction Found

1. **No bugs detected** — build clean, all 1,380 tests pass, no type errors, no lint warnings.

2. **Status.md slightly stale** — reports 1,362 tests (status was generated at session ~62); actual count is now 1,380. The 18-test gap suggests a few tests were added in the final wrap-up session after the status report was written.

3. **Known tech debt items** (from status.md, confirmed by code review):
   - `lint-checks.ts` and `lint-fix.ts` are the two largest library files (650 + 570 = 1,220 lines combined). Each contains 10 check/fix functions that could be split by category (schema checks, content checks, structural checks).
   - `deleteWikiPage` in lifecycle.ts still has its own side-effect orchestration separate from `writeWikiPageWithSideEffects` — the learning about "lifecycle ops, not just writes" hasn't been acted on yet.

4. **Deployment blocker** — Issue #16 requires human action (Cloudflare account creation). The entire 13-issue deployment pipeline is gated on this. No workaround from the agent side.
