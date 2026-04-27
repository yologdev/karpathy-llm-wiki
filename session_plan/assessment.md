# Assessment — 2026-04-27

## Build Status
✅ **PASS** — `pnpm build` clean, `pnpm lint` clean, `pnpm test` passes 1163 tests across 34 test files (9.6s). Zero type errors, zero `any` annotations in non-test source, zero TODOs/FIXMEs in source.

**Security:** `pnpm audit` reports 6 vulnerabilities (3 high, 3 moderate) — `next@15.5.14` has a DoS advisory (patched in 15.5.15), `vite@7.3.1` (via vitest) has 3 advisories (patched in 7.3.2), `postcss@8.5.8` has an XSS advisory (patched in 8.5.10). All are patchable by bumping transitive deps.

## Project State
The project is mature — ~50 sessions in, all four founding vision pillars fully implemented:

| Pillar | Capabilities |
|--------|-------------|
| **Ingest** | URL fetch (Readability+linkedom), text paste, batch multi-URL, content chunking, preview, raw source persistence, image download, source URL tracking, re-ingest API, CLI command |
| **Query** | BM25 + optional vector search with RRF fusion, streaming responses, table format, citation extraction, save-answer-to-wiki loop, query history, CLI command |
| **Lint** | Orphan pages, broken links, empty pages, stale index, missing cross-refs, LLM-powered contradiction detection, missing concept pages, auto-fix for all issue types, configurable checks, CLI command |
| **Browse** | Wiki index (sort/filter/date-range/dataview queries), page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive force-directed graph with clustering, log viewer, raw source browser, global fuzzy search, Obsidian export |

Supporting infrastructure: multi-provider LLM (Anthropic, OpenAI, Google, Ollama), onboarding wizard, dark mode, mobile responsive, accessibility (skip-nav, ARIA landmarks, focus management), Docker deployment, structured logging, CLI tool with 7 subcommands.

## Recent Changes (last 3 sessions)
*From journal (shallow clone, only 1 git commit visible):*

| Session | Date | Focus |
|---------|------|-------|
| ~51 | 2026-04-27 03:44 | Test suites for `lint-checks.ts` and `schema.ts`, loading skeletons for remaining pages |
| ~50 | 2026-04-26 13:21 | DataviewPanel/GlobalSearch decomposition, page template selector in new-page form |
| ~49 | 2026-04-26 03:39 | WikiIndex decomposition, error boundaries and loading skeletons sweep |

**Pattern:** Last 3 sessions were pure infrastructure — test backfill, component decomposition, error handling coverage. No new user-facing features.

## Source Architecture

### Codebase: 31,828 lines across ~148 source files

| Layer | Lines | Files | Description |
|-------|------:|------:|-------------|
| `src/lib/` (source) | ~7,500 | 24 | Core logic modules |
| `src/lib/__tests__/` | ~15,200 | 34 | Unit tests (near 1:2 source-to-test ratio) |
| `src/app/` | ~3,860 | 47 | Pages (13), API routes (21), error boundaries (13) |
| `src/components/` | ~3,750 | 30 | React components |
| `src/hooks/` | ~1,230 | 4 | Custom hooks |

### Largest source files (>400 lines)
- `fetch.ts` (715) — URL fetching, SSRF protection, Readability
- `lint-checks.ts` (535) — All individual lint check functions
- `query.ts` (530) — Query pipeline (search, context building, LLM call)
- `ingest.ts` (490) — Ingest pipeline (URL fetch, chunking, LLM call)
- `embeddings.ts` (479) — Vector store, embedding, cosine similarity
- `search.ts` (469) — BM25 content search, related pages, backlinks
- `lint-fix.ts` (458) — Auto-fix implementations for each lint issue type
- `useGraphSimulation.ts` (451) — Force-directed graph physics + canvas rendering
- `config.ts` (403) — App configuration, provider detection, env resolution
- `wiki.ts` (390) — Wiki filesystem CRUD, index maintenance

### Key architectural decisions
- All `process.env` reads centralized in `config.ts` (2 exceptions in `logger.ts` for `LOG_LEVEL` and `NODE_ENV`)
- Zero `any` types in non-test source
- Zero `console.log/warn/error` in lib (all through structured logger)
- Lifecycle operations (`writeWikiPageWithSideEffects`, `deleteWikiPage`) consolidate all write-path side effects
- Schema conventions loaded at runtime from `SCHEMA.md`, not hardcoded in prompts

## Open Issues Summary
No open issues on GitHub (`gh issue list` returns empty array).

## Gaps & Opportunities

### Relative to founding vision (`llm-wiki.md`)
1. **Marp slide deck generation** — Vision mentions Marp for presentations from wiki content. Not implemented.
2. **Canvas/chart output formats** — Vision mentions matplotlib charts and canvas as query output formats. Only markdown and table formats exist.
3. **Obsidian plugin** — Vision positions Obsidian as the primary IDE. Export exists but no real plugin.
4. **Web search for lint gap-filling** — Vision mentions lint suggesting "web search" to fill data gaps. Current lint detects gaps but doesn't suggest external sources.

### Relative to YOYO.md direction
5. **E2E/integration tests** — Status report lists as Priority 3. No Playwright/Cypress setup.
6. **Multi-user / auth** — Listed as open question. No auth layer.
7. **Component decomposition** — 6 components exceed 200 lines: `BatchIngestForm` (317), `QueryResultPanel` (241), `RevisionHistory` (231), `NavHeader` (224), `ProviderForm` (210), `WikiIndexToolbar` (206).
8. **Component/hook tests** — Zero test files for components or hooks. All 34 test files are in `src/lib/__tests__/`. The 4 hooks (1,227 lines total) and 30 components (3,746 lines) are untested.
9. **API route tests** — Zero dedicated tests for the 21 API routes. Route logic is only tested indirectly through lib module tests.

### Quality & polish
10. **Loading skeletons** — 5 pages still missing `loading.tsx`: `raw/[slug]`, `wiki/[slug]`, `wiki/[slug]/edit`, `wiki/page` (root), `wiki/new`.
11. **Dependency security** — 6 audit vulnerabilities (next, vite, postcss) all patchable.
12. **Accessibility gaps** — ~10 components lack `aria-label` on interactive elements (including `BatchIngestForm`, `DataviewPanel`, `OnboardingWizard`).

## Bugs / Friction Found

### No bugs found
- Build is clean, all tests pass, lint passes, no type errors, no `any` types, no TODOs.

### Friction / debt
1. **Security vulnerabilities** — `next@15.5.14` → 15.5.15, `vite` → 7.3.2, `postcss` → 8.5.10 — all just version bumps, but currently shipping with known high-severity CVEs.
2. **No component/hook/route test coverage** — 5,000+ lines of React code with zero tests. The hooks contain complex state machines (`useGraphSimulation` at 451 lines, `useSettings` at 321 lines) that would benefit from testing.
3. **Session momentum plateau** — Last ~10 sessions have been infrastructure/cleanup (decomposition, test backfill, error boundaries, loading skeletons, accessibility). No new user-facing capabilities since dataview queries and image downloading (session ~45, April 24). The status report's "Future Plan" section has been repeating "query re-ranking quality" as a next item for 15+ sessions without executing it.
4. **Missing loading skeletons** — 5 of 13 pages still lack them, creating inconsistent loading UX.
5. **Status report slightly stale** — Reports 1121 tests but actual count is 1163 (42 tests added since last update). Line counts are also slightly off (~30,750 reported vs 31,828 actual).
