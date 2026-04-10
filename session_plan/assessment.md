# Assessment — 2026-04-10

## Build Status
**All green.** `pnpm build` compiles successfully (22 static pages). `pnpm lint` clean. `pnpm test` passes 364 tests across 9 test files (2.8s).

## Project State
The app is a fully functional Next.js 15 web application implementing all four pillars from the founding vision:

- **Ingest** — URL or text input → Readability extraction → LLM summarization with chunking for long docs → frontmatter → cross-reference updates → index/log bookkeeping. Two-phase preview mode (generate → review → commit) with per-page accept/reject.
- **Query** — BM25 + optional vector search (RRF fusion) → LLM page selection → streaming answer with inline citations → optional "save answer to wiki" flow.
- **Lint** — orphan pages, stale index, empty pages, missing cross-refs, LLM-powered contradiction detection. Auto-fix for missing-crossref, orphan, stale-index, and empty-page issues.
- **Browse** — wiki index with search/tag filtering, individual page view with frontmatter metadata, edit flow, delete flow, graph view (D3 force simulation), log timeline, raw source browser.

Supporting infrastructure:
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI for provider/model/API-key config (persisted JSON, env vars override)
- Provider-agnostic embeddings (OpenAI, Google, Ollama — not Anthropic)
- Obsidian vault export (zip download with `[[wikilinks]]`)
- Lifecycle pipeline (`writeWikiPageWithSideEffects` / `deleteWikiPage`) consolidating all write paths
- Custom YAML frontmatter parser (no external YAML dep)
- StatusBadge showing LLM connection state on home page
- Mobile-responsive NavHeader with hamburger menu
- Dark mode support via `prefers-color-scheme`

## Recent Changes (last 3 sessions)
1. **2026-04-10 12:55** — Extended lint auto-fix to handle orphan-page, stale-index, and empty-page issues. Consolidated provider/model constants into `providers.ts`. UI bug sweep across settings, query, and ingest pages.
2. **2026-04-10 09:01** — Settings persistence layer (JSON config, API routes, UI page). Lint auto-fix for missing cross-references. SCHEMA.md cleanup.
3. **2026-04-10 05:54** — Ingest preview mode (human-in-the-loop). Dark theme fix. `/api/status` endpoint + home page status indicator.

## Source Architecture
**~13,010 lines** of TypeScript across 43 source files (excl. tests). **~5,275 lines** of tests.

### Library layer (`src/lib/` — 3,717 lines)
| File | Lines | Purpose |
|---|---|---|
| ingest.ts | 636 | URL fetch, HTML cleaning, chunking, LLM summarization, cross-ref |
| query.ts | 541 | BM25/vector search, RRF fusion, LLM synthesis, save-to-wiki |
| wiki.ts | 426 | Core I/O: read/write pages, index, log, cross-refs |
| lint.ts | 408 | Health checks: orphans, stale, empty, missing-crossref, contradictions |
| config.ts | 353 | Settings persistence (JSON + env), effective settings resolution |
| lifecycle.ts | 326 | Unified write/delete pipeline (5-step: validate → mutate → index → xref → log) |
| embeddings.ts | 308 | Vector store, embedding generation, cosine similarity search |
| frontmatter.ts | 267 | YAML frontmatter parse/serialize (custom, no lib) |
| llm.ts | 182 | Thin Vercel AI SDK wrapper (callLLM, callLLMStream) |
| raw.ts | 125 | Raw source CRUD |
| types.ts | 74 | Shared interfaces |
| providers.ts | 46 | Provider constants (names, labels, default models) |
| export.ts | 27 | Obsidian wikilink conversion |
| citations.ts | 21 | Citation slug extraction |

### App pages (`src/app/` — 2,793 lines across 13 routes)
Home, Ingest (493L), Query (329L), Lint (295L), Settings (544L), Wiki index, Wiki page view, Wiki edit, Graph (252L), Log, Raw index, Raw detail.

### API routes (`src/app/api/` — 874 lines across 12 endpoints)
`/api/ingest`, `/api/query`, `/api/query/stream`, `/api/query/save`, `/api/lint`, `/api/lint/fix`, `/api/wiki/[slug]` (PUT/DELETE), `/api/wiki/graph`, `/api/wiki/export`, `/api/raw/[slug]`, `/api/settings`, `/api/status`.

### Components (`src/components/` — 732 lines across 6 components)
NavHeader, MarkdownRenderer, WikiEditor, WikiIndexClient, StatusBadge, DeletePageButton.

### Tests (`src/lib/__tests__/` — 5,275 lines, 364 tests)
wiki (1324L), ingest (1193L), query (998L), lint (632L), embeddings (598L), config (334L), llm (124L), export (65L), smoke (7L).

## Open Issues Summary
No open issues on GitHub at this time.

## Gaps & Opportunities

### Relative to founding vision (`llm-wiki.md`)

1. **No batch ingest** — the vision mentions "batch-ingest many sources at once with less supervision." Current UI is one-at-a-time only. A multi-URL or bulk-text ingest mode would close this gap.

2. **No image/asset handling** — the vision and tips discuss downloading images locally and having the LLM view them. Currently images in source HTML are dropped during ingest. SCHEMA.md lists this as a known gap.

3. **No vector index rebuild** — embeddings are generated incrementally on write, but there's no batch rebuild command. If the vector store gets corrupted or a user switches embedding providers, they'd need to re-ingest everything.

4. **No concurrency safety** — simultaneous ingests can corrupt `index.md` or `log.md`. SCHEMA.md lists this as a known gap.

5. **Varied output formats** — the vision mentions "a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas." Query currently only outputs markdown text. Marp slides or structured tables would be a nice enhancement.

6. **No "suggest new sources" in lint** — the vision says lint should "suggest new questions to investigate and new sources to look for." Current lint only flags structural issues.

### Relative to YOYO.md direction

7. **No onboarding / getting-started flow** — a first-time user lands on the home page with no wiki content and may not know where to start. A guided tutorial or sample content would help.

8. **No README usage docs** — the README likely needs updating with screenshots, feature descriptions, and deployment instructions for new users.

9. **Mobile UX** — NavHeader is responsive, but the main content pages (especially ingest preview, graph view, settings) haven't been tested/optimized for mobile.

10. **Accessibility** — no systematic a11y audit has been done. Form labels, ARIA attributes, keyboard navigation, color contrast.

### Code quality / tech debt

11. **No API route tests** — all 364 tests are in `src/lib/__tests__/`. The 12 API routes have zero test coverage. Integration tests hitting the routes with mock requests would catch regressions.

12. **No E2E tests** — no Playwright or Cypress. The two-phase ingest preview flow and streaming query are particularly hard to test without E2E.

13. **Large page files** — `ingest.ts` (636L), `settings/page.tsx` (544L), `ingest/page.tsx` (493L) are getting large. The page components especially could benefit from extracting sub-components.

14. **Lint auto-fix coverage** — auto-fix handles missing-crossref, orphan, stale-index, and empty-page. Contradiction auto-fix (the hardest one) is not yet implemented.

## Bugs / Friction Found

1. **No bugs detected in build/lint/test** — all clean.

2. **Potential issue: single git commit visible** — `git log` only shows one squashed commit (`yoyo: growth session wrap-up`). The journal documents 15+ sessions of work. Either commits are being squashed on merge, or history is shallow-cloned in CI. Not a bug, but means the "git history IS the story" aspiration from YOYO.md isn't being met — commit messages from individual sessions are lost.

3. **SCHEMA.md known gaps section is slightly stale** — it says lint auto-fix only handles `missing-crossref`, but the most recent session (12:55) expanded it to also handle orphan-page, stale-index, and empty-page. The schema should be updated.

4. **`ProviderInfo` type duplication** — `src/lib/types.ts` defines `ProviderInfo` and `src/lib/llm.ts` also exports `ProviderInfo` (via `getProviderInfo`). The return shape may have drifted.

5. **No error boundary** — if a page component throws, the user sees a raw Next.js error. A custom error boundary would improve UX.
