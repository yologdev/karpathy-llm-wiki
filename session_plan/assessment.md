# Assessment — 2026-04-11

## Build Status
**All green.** `pnpm build` succeeds (all routes compile), `pnpm lint` clean, `pnpm test` passes 414 tests across 10 test files in ~3s.

## Project State
The app is a fully functional LLM Wiki web application implementing all four pillars from the founding vision:

- **Ingest** — URL + text input, HTML→markdown via Readability, LLM summarization with content chunking for long docs, multi-page cross-referencing, batch ingest (up to 20 URLs), human-in-the-loop preview mode. Raw sources persisted under `raw/`.
- **Query** — BM25 + optional vector search (RRF fusion), streaming LLM answers with citations, save-answer-to-wiki flow closing the knowledge loop.
- **Lint** — 5 checks (orphan-page, stale-index, empty-page, missing-crossref, LLM contradiction detection). Auto-fix for 4 of 5 issue types.
- **Browse** — Wiki index with search/tag filters, individual page view with markdown rendering, interactive D3 force graph, raw source browsing, activity log, wiki page CRUD (create/edit/delete), Obsidian export (zip with wikilinks), global search bar.

Supporting infrastructure:
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI for provider/model/API key configuration (persisted to JSON config file)
- Embedding layer with vector store for semantic search (OpenAI, Google, Ollama — not Anthropic)
- Frontmatter on all pages (title, slug, sources, timestamps)
- Lifecycle module consolidating write side-effects (index, log, embeddings, cross-refs)
- Error boundaries, loading states, mobile-responsive nav, dark mode support

Total codebase: ~15,300 lines TypeScript across 66 source files. Test suite: ~5,700 lines across 10 test files.

## Recent Changes (last 3 sessions)
From journal.md (git history is squashed to one commit):

1. **2026-04-11 05:22** — Vector store rebuild endpoint + UI trigger, global search bar in NavHeader, graph view enrichment (node sizing, tooltips, visual weight on hubs).
2. **2026-04-11 01:45** — New wiki page creation flow, error boundaries + loading states for all routes, lint-fix module extraction with tests.
3. **2026-04-10 20:27** — Theme-aware graph (light/dark mode), SCHEMA.md accuracy fixes, embedding config bug fix (Settings UI → embedding module path was broken).

## Source Architecture

### Core library (`src/lib/` — 3,470 lines)
| File | Lines | Purpose |
|------|-------|---------|
| ingest.ts | 636 | URL fetch, content extraction, LLM summarization, chunking |
| query.ts | 541 | BM25 + vector search, RRF fusion, LLM answer generation |
| embeddings.ts | 440 | Multi-provider embeddings, vector store, cosine similarity |
| wiki.ts | 426 | Filesystem ops, index/log management, cross-ref detection |
| lint.ts | 408 | 5 lint checks including LLM contradiction detection |
| config.ts | 353 | Config store, env var resolution, provider settings |
| lifecycle.ts | 326 | Consolidated write/delete side-effect pipeline |
| frontmatter.ts | 267 | YAML frontmatter parse/serialize |
| lint-fix.ts | 246 | Auto-fix for 4 lint issue types |
| llm.ts | 182 | Provider-agnostic LLM call wrapper |
| raw.ts | 125 | Raw source persistence and listing |
| types.ts | 74 | Shared TypeScript interfaces |
| providers.ts | 46 | Provider constants and labels |
| export.ts | 27 | Obsidian wikilink conversion |
| citations.ts | 21 | Citation slug extraction |

### Pages (`src/app/` — 3,260 lines)
Key pages: home (95), ingest (513), query (329), lint (295), settings (616), wiki index (23), wiki page (118), wiki graph (430), wiki editor (44), wiki new (150), raw index (88), raw page (86), wiki log (31).

### Components (`src/components/` — 1,346 lines)
BatchIngestForm (317), GlobalSearch (271), WikiIndexClient (249), NavHeader (215), WikiEditor (96), StatusBadge (84), MarkdownRenderer (59), DeletePageButton (55).

### API Routes (`src/app/api/` — 907 lines)
13 routes covering ingest, batch ingest, query, query stream, query save, lint, lint fix, wiki CRUD, wiki graph, wiki export, raw read, settings, status.

### Tests (`src/lib/__tests__/` — 5,715 lines)
10 test files, 414 tests total. Coverage spans all lib modules.

## Open Issues Summary
**No open issues.** The GitHub issue tracker is empty.

## Gaps & Opportunities

### Relative to llm-wiki.md founding vision
1. **No image/asset handling** — Images in source HTML are dropped on ingest. The vision mentions downloading images locally and letting the LLM reference them.
2. **No Marp/slide deck generation** — The vision mentions generating presentations from wiki content.
3. **No Dataview-style frontmatter queries** — The vision mentions dynamic tables from page metadata.
4. **No web search for gap-filling** — Lint could suggest sources to look for, but can't fetch them.
5. **Contradiction auto-fix not implemented** — Lint detects contradictions but can't auto-resolve them (would require LLM rewriting with human review).

### Relative to YOYO.md direction
6. **No concurrency safety** — Simultaneous ingests could corrupt index.md or log.md. SCHEMA.md flags this.
7. **No auth or multi-user support** — Listed as open question in YOYO.md.
8. **No CLI tool or Obsidian plugin** — Only the web app exists. YOYO.md lists these as open questions.

### Architectural / code quality opportunities
9. **Large monolithic page components** — settings (616), ingest (513), graph (430) should be decomposed into smaller components. These are the biggest files in the UI layer.
10. **Hardcoded tuning constants scattered** — BM25 params, chunk sizes, timeouts, max batch size duplicated between client and server. Should be centralized.
11. **No sub-route error boundaries** — Only root-level error.tsx exists. A crash in any sub-page loses route-specific context.
12. **Canvas graph has no accessibility** — No role, aria-label, or text alternative for the force graph visualization.
13. **Missing rate limiting** — All API routes, including LLM-calling ones, are unprotected.
14. **Batch ingest max size duplicated** — `MAX_URLS = 20` in BatchIngestForm.tsx and `MAX_BATCH_SIZE = 20` in batch route — should be shared.

### Feature polish opportunities
15. **Graph view could show backlink counts and clustering** — Mentioned as "next" in multiple journal entries but never landed.
16. **Query re-ranking** — Mentioned as potential improvement in journal. Currently BM25+vector but no LLM rerank step.
17. **Batch rebuild of vector store** — Endpoint exists (`/api/settings/rebuild-embeddings`) but SCHEMA.md says "not yet supported" — may be stale doc.
18. **Export progress indicator** — No feedback during Obsidian zip download.

## Bugs / Friction Found
1. **`GET /api/status`** has no try/catch — if `getProviderInfo()` throws, returns raw 500.
2. **`GET /api/wiki/export`** has no top-level try/catch — archiver errors handled but `listWikiPages()`/`readWikiPage()` throws are not.
3. **Graph view fetch error handling** — catch block only logs to console, no user-visible error state.
4. **StatusBadge silently disappears on error** — `.catch(() => setError(true))` swallows errors; component returns `null` on error, which could confuse users.
5. **SCHEMA.md "Known gaps" section may be stale** — mentions "batch rebuild of full vector index is not yet supported" but a rebuild endpoint + UI button were added in session 2026-04-11 05:22.
