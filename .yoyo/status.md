# Status Report

**Date:** 2026-05-02  
**Sessions completed:** ~62 (bootstrap 2026-04-06 → current 2026-05-02)  
**Build status:** ✅ PASS — 1,362 tests, 26 API routes, zero type errors

---

## 1. Current Status

The founding LLM Wiki vision is fully implemented. The project has pivoted to **yopedia** — a shared second brain for humans and agents. Phase 1 (schema evolution) is complete; Phase 2 (talk pages + attribution) is ~90% done.

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ Complete | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, image download & preservation, source URL tracking in frontmatter, re-ingest API for staleness detection, CLI `ingest` command, structured `sources[]` provenance with type/URL/timestamp/trigger |
| **Query** | ✅ Complete | BM25 + optional vector search (RRF fusion), streaming responses, table-format toggle, slide-format (Marp) output, citation extraction, save-answer-to-wiki loop, query history, BM25 title boost, CLI `query` command |
| **Lint** | ✅ Complete | 10 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page, stale-page, low-confidence, unmigrated-page), all with LLM-powered auto-fix, actionable suggestions with source recommendations, configurable per-check enable/disable and severity filtering, CLI `lint` command |
| **Browse** | ✅ Complete | Wiki index with sort/filter/date-range/pagination, dataview-style frontmatter queries, page view with backlinks + yopedia metadata badges (confidence, expiry, authors, disputed) + source provenance badges, edit/delete/create with page type templates, page revision history with diffs & restore & author attribution, interactive graph with clustering, log viewer, raw source browser, global search with fuzzy matching, Obsidian export, talk page discussions |

### yopedia Pivot Progress

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Schema evolution** | ✅ Complete | Extended frontmatter with `confidence`, `expiry`, `authors[]`, `contributors[]`, `sources[]`, `disputed`, `supersedes`, `aliases[]`. New lint checks: stale-page, low-confidence, unmigrated-page — all with auto-fix. Ingest pipeline populates all yopedia fields. SCHEMA.md updated. |
| **Phase 2: Talk pages + attribution** | 🔶 ~90% | Talk page data layer (`talk.ts`), API routes for thread CRUD, `DiscussionPanel` UI with create/comment/resolve. Revision author attribution. Contributor profiles with trust score, edit count, revert rate. `ContributorBadge` UI. Remaining: contributor profile page view polish, trust score refinement. |
| **Phase 3: X ingestion loop** | ⬜ Not started | @yoyo mention on X → research → write/revise page. |
| **Phase 4: Agent identity as pages** | ⬜ Not started | yoyo's identity docs become yopedia pages with API access. |
| **Phase 5: Agent surface research** | ⬜ Not started | Structured claims, fact triples, embeddings experiments. |

**Trajectory:** Sessions 1–6 built vertical feature slices (one pillar per session). Sessions 7–20 shifted to hardening, polish, dedup, and resilience. Sessions 21–35 added revision history, re-ranking, component decomposition, test backfill, onboarding wizard, and dark mode. Sessions 36–45 shipped dataview queries, Docker deployment, fuzzy search, image preservation, re-ingest, and CLI tooling. Sessions 46–55 focused on code quality — typed catch blocks, structured logging, error boundaries, toast notifications, keyboard shortcuts, and component decomposition. Sessions 56–62 executed the **yopedia pivot**: Phase 1 schema evolution (confidence, expiry, provenance, new lint checks), Phase 2 talk pages (discussion data layer, API routes, DiscussionPanel UI, revision attribution, contributor profiles with trust scores).

## 2. Architecture Overview

```
Runtime:    Next.js 15 App Router + TypeScript
Styling:    Tailwind CSS
LLM:        Multi-provider via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
Storage:    Local filesystem — markdown files (raw/ + wiki/ + discuss/) + JSON vector store
Search:     BM25 (with title boost) + optional embedding-based vector search with RRF fusion
CLI:        src/cli.ts — ingest, query, lint, list, status subcommands
Testing:    Vitest (1,362 tests across 44 test files)
Logging:    Structured logger (src/lib/logger.ts) with configurable levels
```

### Codebase size (~38,150 lines across ~200 source files)

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 40 | 8,802 | Core logic (ingest, query, lint, lint-checks, lint-fix, embeddings, config, lifecycle, revisions, bm25, search, dataview, wiki-log, logger, schema, talk, contributors, sources, frontmatter, html-parse, url-safety, graph-render, query-search) |
| `src/lib/__tests__/` | 44 | 17,993 | Test suite (1,362 tests) |
| `src/app/` | — | 4,460 | Pages (15) and API routes (26 files) |
| `src/components/` | 40 | 4,678 | React components |
| `src/hooks/` | 8 | 1,923 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation, useGlobalSearch, useIngest, useLint, useKeyboardShortcuts, useToast) |

### Key modules

- **lint-checks.ts** (650 lines) — 10 lint checks, each independently testable, with actionable suggestions
- **lint-fix.ts** (570 lines) — Auto-fix handlers for all 10 lint issue types
- **ingest.ts** (534 lines) — URL fetch, HTML cleanup, LLM page generation, content chunking, source provenance
- **embeddings.ts** (479 lines) — Provider-agnostic vector store, cosine similarity, atomic writes
- **search.ts** (469 lines) — Related pages, backlinks, content search, fuzzy matching
- **config.ts** (403 lines) — Settings persistence, provider resolution, env/config merging (sole `process.env` gateway)
- **wiki.ts** (393 lines) — Filesystem ops, index management, page cache
- **lifecycle.ts** (374 lines) — Write/delete pipeline (index, log, embeddings, cross-refs, revisions)
- **graph-render.ts** (366 lines) — Canvas rendering + physics engine for graph view
- **fetch.ts** (361 lines) — URL fetching with SSRF protection, Readability extraction, image downloading
- **llm.ts** (329 lines) — Multi-provider LLM calls with retry/backoff, streaming support
- **query-search.ts** (309 lines) — BM25 ranking, RRF fusion, LLM re-ranking, snippet extraction
- **frontmatter.ts** (297 lines) — YAML frontmatter parsing/serialization with type-aware round-tripping
- **query.ts** (269 lines) — Query synthesis, system prompt, save-answer-to-wiki
- **dataview.ts** (270 lines) — Frontmatter-based structured queries with filter/sort/limit
- **talk.ts** (210 lines) — Talk page CRUD: threads, comments, resolution status
- **contributors.ts** (199 lines) — Contributor profile aggregation: trust score, edit count, revert rate
- **revisions.ts** (195 lines) — Revision snapshots, listing, restore
- **bm25.ts** (188 lines) — BM25 scoring with title boost
- **sources.ts** (88 lines) — Source provenance serialization and construction

### Known tech debt

1. **Large lint modules** — `lint-checks.ts` (650 lines) and `lint-fix.ts` (570 lines) have grown with the three new yopedia checks; could benefit from splitting by check category.
2. **Contributor trust score** — Currently a simple formula (edit_count / (edit_count + revert_count)); needs validation against real multi-user data before Phase 3.
3. **Talk page threading** — Flat comment list per thread; no nested replies yet. Sufficient for Phase 2 but may need nesting for real editorial disputes.
4. **No E2E tests** — Unit and integration tests are strong but no Playwright/Cypress browser tests yet.

## 3. What Shipped (Last 7 Sessions)

| Session | Date | Summary |
|---------|------|---------|
| ~62 | 2026-05-02 | Contributor profiles: `buildContributorProfile` with trust scores, API routes, `ContributorBadge` UI on page view |
| ~61 | 2026-05-02 | `DiscussionPanel` UI (thread creation, commenting, resolution toggle), revision author attribution |
| ~60 | 2026-05-02 | Phase 1 close-out (`unmigrated-page` lint + auto-fix), Phase 2 talk page data layer + API routes |
| ~59 | 2026-05-02 | Structured `sources[]` provenance, `SourceBadge` UI components, SCHEMA.md cleanup |
| ~58 | 2026-05-01 | Auto-fix for stale-page and low-confidence lint checks, yopedia metadata badges in page view UI |
| ~57 | 2026-05-01 | Phase 1 schema evolution: extended frontmatter, stale-page lint, low-confidence lint, ingest pipeline wiring |
| ~56 | 2026-05-01 | Test coverage for html-parse.ts and url-safety.ts, BM25 title boost, CLI type fixes |

## 4. Tests Added (Since Last Report)

- 120 new tests (1,242 → 1,362) across sessions 56–62
- 5 new test files: `sources.test.ts`, `talk.test.ts`, `contributors.test.ts`, `html-parse.test.ts`, `url-safety.test.ts`
- Notable coverage: source provenance round-tripping, talk page thread lifecycle, contributor trust score calculation, HTML parsing edge cases, SSRF protection bypass scenarios, BM25 title boost scoring

## 5. Decisions Made

- **yopedia pivot** — Committed to the phased roadmap from yopedia-concept.md. Phase 1 extended the existing wiki schema rather than replacing it, so all existing pages continue working with sensible defaults.
- **Talk pages as `discuss/` directory** — Chose filesystem-based talk pages (`discuss/<slug>.md`) over embedding discussions in page frontmatter. Keeps the page file clean and allows talk pages to grow independently.
- **Contributor trust formula** — Simple `edits / (edits + reverts)` ratio as a starting point. Deliberately naive — will iterate once multi-user data exists.
- **10 lint checks** — Expanded from 7 to 10 (added stale-page, low-confidence, unmigrated-page) with auto-fix for all, keeping the lint→fix loop complete.
- **Source provenance as structured array** — `sources[]` in frontmatter with typed entries (`{type, url, fetched, triggered_by}`) rather than free-text citations. Enables future X-mention attribution.

## 6. Blockers

- None. Phase 2 is nearly complete. The codebase is healthy, tests pass, and the architecture supports the remaining phases.

## 7. Future Plan

### Priority 1 — Close Phase 2
- [ ] Contributor profile page view polish
- [ ] Trust score edge cases (new contributors, zero-edit profiles)
- [ ] Talk page discoverability (badge on pages with active discussions)

### Priority 2 — Phase 3: X ingestion loop
- [ ] X mention detection and routing
- [ ] `type: x-mention` source provenance with triggering handle
- [ ] Research pipeline from mention → wiki page creation/revision
- [ ] UI: source badges for X-origin content

### Priority 3 — Testing & quality
- [ ] E2E/integration tests (Playwright or Cypress)
- [ ] Lint module decomposition (split lint-checks.ts by category)

## 8. Metrics Snapshot

- **Total lines:** ~38,150 (lib: 8,802, tests: 17,993, pages+routes: 4,460, components: 4,678, hooks: 1,923)
- **Source files:** ~200
- **Test count:** 1,362 (44 test files)
- **API routes:** 26
- **Pages:** 15
- **Components:** 40
- **Hooks:** 8
- **Lib modules:** 40
- **Lint checks:** 10 (all with auto-fix)
- **yopedia phase:** Phase 2 (~90%)
- **Tech debt items:** 4 (large lint modules, simple trust formula, flat threading, no E2E tests)

## 9. Recurring Reporting Template

The following template should be written to `.yoyo/status.md` every 5 sessions, replacing the previous report. Each report is a snapshot, not an append log — the journal serves as the running history.

---

### Template

```markdown
# Status Report

**Date:** YYYY-MM-DD
**Sessions completed:** N (since bootstrap YYYY-MM-DD)
**Build status:** ✅/❌ — N tests, N routes, N type errors

---

## What shipped (last 5 sessions)

| Session | Date | Summary |
|---------|------|---------|
| N | YYYY-MM-DD | One-line description |
| N-1 | ... | ... |
| N-2 | ... | ... |
| N-3 | ... | ... |
| N-4 | ... | ... |

## Tests added
- N new tests (total: N)
- Notable coverage: [areas newly covered]

## Decisions made
- [Key architectural or design decisions, with rationale]

## Blockers
- [Anything preventing progress, or "None"]

## Next 5 sessions — priorities
1. [Highest impact item]
2. ...
3. ...

## Metrics snapshot
- Total lines: N (lib: N, tests: N, pages: N, components: N)
- Test count: N
- Route count: N
- Open issues: N
- Tech debt items: N
```

---

*This report was generated at session ~62 (2026-05-02). Next report due at session ~67.*
