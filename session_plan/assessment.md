# Assessment — 2026-04-20

## Build Status
✅ **ALL PASS** — `pnpm build` succeeds (zero warnings/errors), `pnpm lint` clean, `pnpm test` passes **964 tests across 28 test files** (5.3s). No type errors.

Note: status.md reports 908 tests — actual count has grown to 964 since that snapshot. The status report (session ~33) is slightly stale.

## Project State

The project is a **mature, fully-featured web application** implementing all four founding vision pillars:

| Pillar | Implementation | Key capabilities |
|--------|---------------|-----------------|
| **Ingest** | Complete | URL fetch (Readability + linkedom + SSRF protection), text paste, batch multi-URL, content chunking for large docs, human-in-the-loop preview, raw source persistence, cross-reference auto-discovery |
| **Query** | Complete | Hybrid BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history persistence |
| **Lint** | Complete | 7 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page, broken-link), all with LLM-powered auto-fix, configurable per-check enable/disable and severity filtering |
| **Browse** | Complete | Wiki index with sort/filter/date-range, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive canvas graph with clustering & community detection, log viewer, raw source browser, global full-text search, Obsidian export |

**Supporting infrastructure:** Multi-provider LLM (Anthropic/OpenAI/Google/Ollama via Vercel AI SDK), settings UI with onboarding wizard, dark mode toggle, provider-agnostic embedding layer, file locking, SSRF protection, path traversal guards.

## Recent Changes (last 3 sessions)

| Session | Date | Focus |
|---------|------|-------|
| ~35 | 2026-04-19 | Onboarding wizard (detects empty wiki, walks user through setup + first ingest), dark mode toggle (localStorage + system preference), test suites for `wiki-log.ts`, `lock.ts`, `providers.ts` |
| ~34 | 2026-04-19 | Test backfill for `fetch.ts` (SSRF, Readability, URL validation) and `lifecycle.ts` (write/delete pipeline, side effects) |
| ~33 | 2026-04-18 | Test backfill for `search.ts`, `raw.ts`, `links.ts`, `citations.ts` |

**Pattern:** The last ~6 sessions have been exclusively test backfill and polish — no new features. The founding vision's core scope is complete.

## Source Architecture

### Codebase: ~26,400 lines across 115 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 29 modules | ~6,300 | Core logic (ingest, query, lint, embeddings, config, lifecycle, revisions, bm25, search, wiki-log, fetch, links, etc.) |
| `src/lib/__tests__/` | 28 test files | ~12,800 | Test suite (964 tests) |
| `src/app/` pages | 13 pages | ~2,200 | Next.js page components |
| `src/app/api/` | 18 route files | ~1,300 | API routes |
| `src/components/` | 20 components | ~3,200 | React UI components |
| `src/hooks/` | 2 hooks | ~510 | useSettings, useStreamingQuery |

### Largest files (potential decomposition targets)

| File | Lines | Notes |
|------|------:|-------|
| `src/lib/lint.ts` | 625 | 7 checks — already large but cohesive |
| `src/app/wiki/graph/page.tsx` | 485 | Canvas rendering extracted to `graph-render.ts` but page still large |
| `src/lib/embeddings.ts` | 472 | Vector store + embedding ops — cohesive |
| `src/lib/query.ts` | 462 | BM25 extracted to `bm25.ts`, but still handles search + context + synthesis |
| `src/lib/ingest.ts` | 461 | Fetch extracted to `fetch.ts`, but still handles chunking + LLM + cross-refs |
| `src/lib/lint-fix.ts` | 458 | 7 fix handlers — one per lint check, cohesive |
| `src/lib/fetch.ts` | 403 | URL fetching + SSRF + Readability |
| `src/app/ingest/page.tsx` | 363 | Decomposed into sub-components but page still orchestrates |
| `src/lib/wiki.ts` | 370 | Filesystem ops, index management, page cache |
| `src/lib/lifecycle.ts` | 355 | Write/delete pipeline — side-effect orchestration |
| `src/components/GlobalSearch.tsx` | 346 | Full-text search UI |
| `src/components/WikiIndexClient.tsx` | 341 | Index with sort/filter/date-range |

### Test coverage map

**Modules with dedicated tests (26):** bm25, citations, config, embeddings, errors, export, fetch, format, frontmatter, graph-render, graph, ingest, lifecycle, links, lint-fix, lint, llm, lock, providers, query-history, query, raw, revisions, search, slugify, wiki-log, wiki, + smoke test.

**Modules without tests (2):** `constants.ts` (83 lines — static values, low risk), `types.ts` (85 lines — type-only, no runtime logic).

## Open Issues Summary

**No open GitHub issues.** The `gh issue list` call returned an empty array. Community engagement is quiet — no pending feature requests or bug reports.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision

1. **Image/asset handling** — llm-wiki.md explicitly discusses downloading images locally and having the LLM reference them. Current ingest drops all images from HTML. This is a documented known gap in SCHEMA.md.

2. **CLI tool** — llm-wiki.md mentions small CLI tools for search/operations. YOYO.md lists "CLI tool for headless ingest/query/lint operations" as Priority 3. No CLI exists.

3. **Obsidian integration** — llm-wiki.md frames Obsidian as the primary reading interface. Current app has an Obsidian export (link format conversion) but no plugin. The export is one-way.

4. **Schema co-evolution** — llm-wiki.md emphasizes the schema evolving with the LLM over time. SCHEMA.md exists and documents current conventions, but doesn't get loaded by query or lint prompts — only ingest reads it at runtime (per learnings.md).

5. **Marp/slide deck generation** — llm-wiki.md mentions Marp as a query output format. Not implemented.

6. **Dataview-style queries** — llm-wiki.md mentions frontmatter-powered dynamic queries. Not implemented. Frontmatter exists on pages but can't be queried programmatically from the UI.

### Relative to YOYO.md priorities

- **Priority 1 (remaining test gaps):** Nearly complete — only `constants.ts` and `types.ts` lack tests, both trivial/type-only. The status report's claim of "4 untested modules" is stale; `lock.ts`, `providers.ts`, and `wiki-log.ts` now have tests.

- **Priority 2 (UX polish):** Dark mode landed, onboarding wizard landed. Mobile responsiveness is still weak — only 10 responsive breakpoint usages across all components. The app is desktop-first.

- **Priority 3 (capability gaps):** CLI tool, image handling, Dataview queries — all unstarted.

- **Priority 4 (ecosystem):** Obsidian plugin, multi-user/auth — all unstarted.

### Emergent opportunities

1. **Mobile/responsive layout** — The app has minimal responsive design. NavHeader, GlobalSearch, WikiIndexClient, graph page, and ingest form would all benefit from mobile breakpoints.

2. **Accessibility** — 23 aria/role usages across the codebase is decent but spotty. No skip-nav link, no focus management on route transitions, graph page relies entirely on canvas (no text alternative for the full graph).

3. **Performance at scale** — Index.md scanning works for ~100 pages (per llm-wiki.md). No pagination on wiki index, lint results, or query history. Large wikis will hit performance walls.

4. **Error recovery UX** — Error boundaries exist on every page, but they all render the same generic "try again" message. No contextual guidance (e.g., "Check your API key" for LLM failures).

5. **E2E/integration tests** — All 964 tests are unit tests in vitest. No browser-level tests (Playwright, Cypress). API routes are untested at the HTTP level.

## Bugs / Friction Found

1. **Noisy test stderr** — Tests output expected ENOENT warnings and JSON parse errors to stderr. These are intentional (testing error paths) but make test output noisy. Could suppress with test-scoped console mocks.

2. **Status report drift** — `.yoyo/status.md` says 908 tests / 25 files / "4 untested modules" — actual is 964 tests / 28 files / 2 untested modules. The report template says "every 5 sessions" but hasn't been updated since session ~33.

3. **SCHEMA.md known gaps section is stale** — Lists only 5 lint checks in auto-fix section, but 7 exist (missing `missing-concept-page` and `broken-link`). The lint checks section also only lists 5 checks, missing the same two.

4. **`process.env` reads bypass config** — 4 lib modules (`config.ts`, `embeddings.ts`, `llm.ts`, `wiki.ts`) still read `process.env` directly. This is documented tech debt. `config.ts` doing it is expected (it's the config layer itself), but `embeddings.ts`, `llm.ts`, and `wiki.ts` should ideally go through config.

5. **Graph page still 485 lines** — Despite extracting `graph-render.ts`, the page component remains the largest page by far. Canvas interaction handling, data fetching, and UI controls are all in one file.

6. **Dark mode CSS uses Tailwind v4 `@custom-variant` syntax** — This works but means dark mode requires Tailwind's `.dark` class approach. Components using inline styles or non-Tailwind CSS won't respect dark mode. The `globals.css` only defines `--background` and `--foreground` custom properties — other colors (borders, secondary text, hover states) may not adapt.
