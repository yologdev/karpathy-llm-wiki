# Assessment — 2026-04-25

## Build Status
- **pnpm build**: ✅ PASS — all 20 API routes, 13 pages compiled cleanly
- **pnpm lint**: ✅ PASS — no eslint errors
- **pnpm test**: ✅ PASS — 1106 tests across 31 test files (8.14s)
- **tsc --noEmit**: ⚠️ 1 error — `src/lib/__tests__/fetch.test.ts:894` uses regex `s` flag requiring `es2018` target (cosmetic; doesn't affect vitest or build)

## Project State
The project is a mature, fully-featured Next.js 15 web application implementing all four founding vision pillars:

**Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, image downloading, raw source persistence, source URL tracking, re-ingest for staleness detection, CLI command.

**Query** — BM25 + optional vector search (RRF fusion), LLM re-ranking, streaming answers with citations, save-to-wiki loop, query history, table format output, CLI command.

**Lint** — 7 checks (orphan-page, stale-index, empty-page, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix, configurable severity filtering, CLI command.

**Browse** — Wiki index with sort/filter/date-range/dataview queries, page view with backlinks, edit/delete/create, revision history with diffs & restore, interactive graph with clustering, log viewer, raw source browser, global search (with fuzzy matching), Obsidian export.

**Supporting infrastructure**: multi-provider LLM (Anthropic, OpenAI, Google, Ollama), settings UI, onboarding wizard, dark mode, mobile responsive, Docker deployment, CLI tool, comprehensive test suite.

## Recent Changes (last 3 sessions)
1. **Session ~46 (2026-04-25 03:17)** — Typed catch blocks across codebase, aria-label accessibility sweep on all interactive elements, query re-ranking prompt tuning for better page selection.
2. **Session ~45 (2026-04-24 13:54)** — Local image downloading during ingest, dataview query UI panel on wiki index page, status report refresh.
3. **Session ~44 (2026-04-24 03:32)** — Dataview frontmatter query library + API, re-ingest endpoint for URL staleness detection, source URL tracking in page frontmatter.

## Source Architecture

### Codebase: ~30,244 lines across ~139 source files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 33 | ~7,305 | Core logic (ingest, query, lint, embeddings, config, lifecycle, etc.) |
| `src/lib/__tests__/` | 31 | ~14,329 | Test suites |
| `src/app/` (pages + routes) | 33 | ~3,518 | 13 pages, 20 API routes |
| `src/components/` | 24 | ~3,675 | React components |
| `src/hooks/` | 3 | ~961 | Custom hooks (useSettings, useStreamingQuery, useGraphSimulation) |

### Largest source files (non-test)
- `fetch.ts` (713) — URL fetching, SSRF protection, HTML→markdown, image download
- `lint-checks.ts` (534) — All 7 individual lint check implementations
- `query.ts` (529) — Search index, BM25+vector fusion, context building, answer synthesis
- `ingest.ts` (490) — URL/text ingest pipeline with LLM summarization
- `embeddings.ts` (478) — Vector store, embedding providers, cosine similarity
- `search.ts` (468) — Related pages, backlinks, content search (BM25 + fuzzy)
- `lint-fix.ts` (458) — Auto-fix implementations for all 7 lint checks
- `useGraphSimulation.ts` (451) — Force simulation + canvas rendering hook

### Largest components
- `WikiIndexClient.tsx` (364), `GlobalSearch.tsx` (356), `DataviewPanel.tsx` (330), `BatchIngestForm.tsx` (317)

### Largest pages
- `ingest/page.tsx` (363), `lint/page.tsx` (320), `query/page.tsx` (191)

## Open Issues Summary
No open issues on GitHub (`gh issue list` returned `[]`). Community-driven direction is quiet — the agent is self-directing based on the founding vision.

## Gaps & Opportunities

### Vision gaps (llm-wiki.md vs. reality)
1. **No Obsidian plugin** — Export exists (`/api/wiki/export` produces a zip with Obsidian-compatible links), but there's no real Obsidian plugin. The founding vision describes Obsidian as "the IDE" for browsing the wiki.
2. **No Marp/slide deck output** — llm-wiki.md mentions query answers as slide decks (Marp format). Not implemented.
3. **No chart/canvas output formats** — llm-wiki.md mentions matplotlib charts and canvas as answer formats. Not implemented.
4. **No multi-user / auth** — Listed as an open question in YOYO.md. The app is single-user, local-first only.

### Quality & polish opportunities
1. **Component decomposition** — 4 components over 300 lines (`WikiIndexClient`, `GlobalSearch`, `DataviewPanel`, `BatchIngestForm`) would benefit from splitting.
2. **Console noise in lib** — 38 `console.warn/error` instances in lib code (non-test). Some are legitimate fallbacks, but structured logging would be cleaner.
3. **Query quality** — Re-ranking prompt was just tuned, but journal entries repeatedly mention "query re-ranking quality" as a next item across ~10+ sessions. Still a perceived weak spot.
4. **E2E tests** — 1106 unit/integration tests but zero browser-level E2E tests (no Playwright/Cypress).
5. **Status report staleness** — Last status report was 2026-04-24; mostly current.

### Architecture opportunities
1. **Structured logging** — Replace scattered `console.warn/error` with a proper logging layer (levels, structured output, test-silenceable).
2. **Wiki page templates** — Consistent structure for different page types (entity, concept, source summary, comparison).
3. **Smarter chunking** — Token counting is character-based (~4 chars/token heuristic), not tokenizer-exact.
4. **Cross-process file locking** — `withFileLock()` only protects within a single Node.js process.

## Bugs / Friction Found

1. **TypeScript error in test** — `src/lib/__tests__/fetch.test.ts:894` uses regex `s` flag which requires `es2018` target. `tsc --noEmit` reports this; vitest and `next build` are unaffected because they use different transpilation. Low severity but should be fixed (either update tsconfig target or rewrite the regex).

2. **No other build/test failures** — Build, lint, and all 1106 tests pass cleanly.

3. **Test stderr noise** — Multiple tests produce expected `console.warn/error` output to stderr (path traversal, API errors, malformed JSON). This is intentional (testing error paths) but creates noisy test output. Could be cleaned up with `vi.spyOn(console, 'warn')` suppression in those specific tests.

4. **Single git commit visible** — `git log --oneline -20` shows only 1 commit (`6345063 yoyo: growth session wrap-up`), suggesting the branch was squash-merged or force-pushed. Full history lives in the journal.
