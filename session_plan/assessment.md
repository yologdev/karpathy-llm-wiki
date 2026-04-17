# Assessment — 2026-04-17

## Build Status

**All green.** `pnpm build` ✅, `pnpm lint` ✅, `pnpm test` ✅ (622 tests across 17 test files, all passing).

Build emits expected ENOENT warnings for missing `wiki/index.md` and `wiki/log.md` during static page generation (these files are created at runtime when the user's wiki exists). Not a bug — graceful degradation working as intended.

## Project State

The app is a fully functional Next.js 15 web application implementing all four pillars of the founding vision:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, preview before commit, raw source persistence, cross-reference updates to related pages
- **Query** — BM25 + optional vector search with RRF fusion, LLM re-ranking, streaming responses, table-format toggle, citation extraction, save-answer-to-wiki loop, query history persistence
- **Lint** — 7 checks (orphan pages, stale index, empty pages, missing cross-refs, contradictions, missing concept pages, broken links), all with LLM-powered auto-fix
- **Browse** — Wiki index with search/filter/tags, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive canvas graph with community clustering, log viewer, raw source browser, global full-text search, Obsidian export

Supporting infrastructure: multi-provider LLM (Anthropic, OpenAI, Google, Ollama via Vercel AI SDK), settings UI with config persistence, SSRF protection, file locking, page caching, error boundaries on all routes, SCHEMA.md loaded at runtime into prompts.

## Recent Changes (last 3 sessions)

1. **2026-04-16 14:03** — Copy-as-markdown button on query results, QueryHistorySidebar extraction from query page, wiki-log module split from wiki.ts
2. **2026-04-16 03:32** — Table-format queries (comparison/matrix rendering), graph-render.ts extraction from graph page, BM25 extraction into bm25.ts
3. **2026-04-15 13:54** — Structured `target` field on LintIssue (killed 51 lines of regex parsing), search.ts extraction from wiki.ts

**Pattern:** All three sessions focused on component/module decomposition and small UX additions. No new major features — the project is in a hardening/refactoring phase.

## Source Architecture

**102 source files, ~21,600 lines total**

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 24 | 6,094 | Core logic modules |
| `src/lib/__tests__/` | 17 | 9,024 | Test suites (622 tests) |
| `src/app/` (pages) | ~20 | ~3,100 | Next.js pages and layouts |
| `src/app/api/` | 15 | ~1,100 | API route handlers |
| `src/components/` | 17 | 2,279 | React components |

### Largest files (potential decomposition targets)

| File | Lines | Notes |
|------|------:|-------|
| `src/lib/lint.ts` | 574 | 7 lint checks in one monolithic function |
| `src/app/query/page.tsx` | 508 | Still the largest page despite sidebar extraction |
| `src/app/wiki/graph/page.tsx` | 485 | Canvas rendering + force sim + UI all in one |
| `src/lib/embeddings.ts` | 472 | Vector store + embedding + search |
| `src/lib/query.ts` | 462 | Search + context building + LLM orchestration |
| `src/lib/ingest.ts` | 461 | Ingestion pipeline |
| `src/lib/lint-fix.ts` | 458 | 7 fix handlers |
| `src/lib/fetch.ts` | 403 | URL fetching + validation + SSRF |
| `src/app/settings/page.tsx` | 402 | Settings UI |
| `src/lib/wiki.ts` | 367 | File I/O + index + cache (was 440, partially extracted) |

## Open Issues Summary

**No open issues** on GitHub (`gh issue list` returned `[]`).

## Gaps & Opportunities

### vs. YOYO.md vision

| Vision item | Status | Gap |
|-------------|--------|-----|
| Ingest | ✅ Done | Image/asset handling during ingest (currently dropped) |
| Query | ✅ Done | No Marp slide deck or matplotlib chart output formats |
| Lint | ✅ Done | Individual check toggling, configurable severity |
| Browse | ✅ Done | — |
| CLI tool | ❌ Not started | Headless ingest/query/lint for terminal users |
| Obsidian plugin | ❌ Not started | Export exists, but no real plugin |
| Multi-user/auth | ❌ Not started | Local-first only |

### vs. llm-wiki.md founding pattern

| Pattern element | Status | Gap |
|-----------------|--------|-----|
| Raw sources immutable | ✅ | — |
| Wiki is LLM-maintained | ✅ | — |
| Schema co-evolves | ✅ | SCHEMA.md loaded into prompts at runtime |
| Ingest (single + batch) | ✅ | — |
| Query with citations | ✅ | — |
| Query answers filed back as wiki pages | ✅ | — |
| Lint health-check | ✅ | — |
| index.md catalog | ✅ | — |
| log.md chronological | ✅ | — |
| CLI search tool | 🟡 Partial | BM25 + vector search via API, no CLI binary |
| Dataview-style frontmatter queries | ❌ | Frontmatter written but not queryable |
| Image handling | ❌ | Not implemented |

### Code quality priorities (from status.md + code review)

1. **Large page components** — query/page.tsx (508), graph/page.tsx (485), settings/page.tsx (402), lint/page.tsx (353), ingest/page.tsx (363) still have significant UI logic that could be decomposed
2. **lint.ts monolith** — 574 lines, single `lint()` function running all 7 checks sequentially (LLM checks are parallelized internally). No way to run individual checks or configure severity
3. **No E2E or integration tests** — All 622 tests are unit tests mocking the LLM. No browser tests, no API route tests hitting the actual server
4. **Accessibility** — Graph view has keyboard support but broader a11y audit hasn't been done
5. **Dark mode** — Graph respects theme but broader dark mode support unclear

### Feature opportunities

1. **Real-time feedback during ingest** — Currently no streaming progress; user waits for full LLM response
2. **Drag-and-drop file upload** — Vision mentions source documents beyond URLs
3. **Wiki diff/changelog view** — Revisions exist per-page but no global "what changed today" view
4. **Search improvements** — BM25 is solid but no fuzzy matching, no typo tolerance
5. **Mobile responsiveness** — Not assessed but likely needs work given canvas graph view

## Bugs / Friction Found

1. **Build ENOENT warnings** — `wiki/index.md` and `wiki/log.md` missing during static generation. Not a bug (graceful fallback works) but noisy in build output. Could suppress with `dynamic = 'force-dynamic'` or ensure directories exist at build time.

2. **Test stderr noise** — Many tests emit ENOENT warnings to stderr for expected missing-file scenarios. Tests pass but output is cluttered. Could benefit from suppressing expected error logs in test setup.

3. **No open issues** — Zero community signal to steer priorities. The project's direction is entirely self-determined right now.

4. **Status report stale** — `.yoyo/status.md` dates from 2026-04-15 and references 616 tests; actual count is now 622. Minor drift but shows the report cadence slipping.
