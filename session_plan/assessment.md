# Assessment — 2026-04-11

## Build Status
**All green.** `pnpm build` succeeds (static + dynamic routes). `pnpm lint` clean (zero warnings). `pnpm test` passes 443 tests across 10 test files in 3s.

## Project State
The app is a fully functional local-first LLM Wiki implementing all four pillars from the founding vision:

**Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, preview-before-commit, content chunking for long docs. Saves raw source, generates wiki page via LLM, updates index, cross-references related pages, appends to log.

**Query** — BM25 + optional vector search (RRF fusion), streaming responses, save-answer-to-wiki loop. Hybrid retrieval when embedding provider is configured; graceful BM25-only fallback for Anthropic-only users.

**Lint** — Five checks (orphan-page, stale-index, empty-page, missing-crossref, contradiction). All five have auto-fix paths including LLM-powered contradiction resolution.

**Browse** — Wiki index with search/tag filters, individual page view, edit flow, delete flow, new page creation, graph view (custom force simulation with sizing/tooltips), log viewer, raw source browser, global search bar, Obsidian export (zip with wikilinks).

**Settings** — UI-based provider/model/API key configuration persisted to JSON config, status badge, embedding rebuild trigger.

**Infrastructure** — Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), file locking, exponential backoff retries, error boundaries on all routes, centralized constants, YAML frontmatter, lifecycle module for write/delete side-effects.

## Recent Changes (last 3 sessions)
1. **Contradiction auto-fix + file locking + LLM retry resilience** (12:40) — Completed the lint auto-fix story. All 5 issue types now have automated remediation. Added `withFileLock` for concurrent operation safety and exponential backoff for transient LLM failures.
2. **Error boundaries + centralized constants + API bug fixes** (08:35) — Sub-route error boundaries, magic numbers swept into `constants.ts`, error handling fixes across API routes.
3. **Vector store rebuild + global search + graph enrichment** (05:22) — Rebuild embeddings endpoint, global search in NavHeader, graph view enhanced with node sizing and tooltips.

## Source Architecture

**16,321 total lines** across 67 source files (app + lib + components).

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # 13 API routes (922 lines)
│   │   ├── ingest/         # POST single + POST batch
│   │   ├── lint/           # POST lint + POST fix
│   │   ├── query/          # POST query + POST stream + POST save
│   │   ├── raw/[slug]/     # GET raw source
│   │   ├── settings/       # GET/PUT config + POST rebuild-embeddings
│   │   ├── status/         # GET health check
│   │   └── wiki/           # POST create + GET/PUT/DELETE [slug] + GET graph + GET export
│   ├── ingest/page.tsx     # 513 lines (client)
│   ├── query/page.tsx      # 329 lines (client)
│   ├── lint/page.tsx       # 317 lines (client)
│   ├── settings/page.tsx   # 616 lines (client) ← largest page
│   ├── wiki/               # browse, [slug], [slug]/edit, graph, log, new
│   ├── raw/                # source browser
│   └── page.tsx            # 95 lines (server, home dashboard)
├── components/             # 7 shared components (1,352 lines)
│   ├── NavHeader.tsx       # 215 lines (mobile-responsive nav + global search)
│   ├── GlobalSearch.tsx    # 271 lines
│   ├── BatchIngestForm.tsx # 316 lines
│   ├── WikiIndexClient.tsx # 249 lines
│   └── ...                 # MarkdownRenderer, WikiEditor, DeletePageButton, StatusBadge
└── lib/                    # Core logic (3,432 lines) + tests (6,522 lines)
    ├── ingest.ts           # 627 lines (URL fetch, chunking, LLM wiki generation)
    ├── query.ts            # 536 lines (BM25, vector search, RRF, context building)
    ├── wiki.ts             # 433 lines (filesystem CRUD, index, log, cross-refs)
    ├── embeddings.ts       # 440 lines (vector store, embedding providers)
    ├── lint.ts             # 408 lines (5 lint checks)
    ├── config.ts           # 353 lines (settings persistence)
    ├── lifecycle.ts        # 327 lines (write/delete side-effect orchestration)
    ├── lint-fix.ts         # 307 lines (auto-fix for all 5 issue types)
    ├── llm.ts              # 306 lines (multi-provider callLLM + retry)
    ├── frontmatter.ts      # 267 lines (YAML parse/serialize)
    └── ...                 # raw.ts, types.ts, constants.ts, providers.ts, etc.
```

**Test coverage:** 10 test files, 443 tests, 6,522 lines. All library modules have tests. No component or API route tests.

## Open Issues Summary
No open issues on the repository. The agent is self-directing based on the founding vision.

## Gaps & Opportunities

### High-impact gaps (vision → reality)

1. **SCHEMA.md is stale on contradiction auto-fix** — Says "No auto-fix yet" for contradictions, but the code now has `fixContradiction()` in `lint-fix.ts`. Journal confirms it landed at 12:40 today. Schema needs updating.

2. **No image handling on ingest** — The founding vision mentions "Articles, papers, images, data files" as raw sources. SCHEMA.md lists this as a known gap. URL ingest strips images entirely. No asset storage, no image viewing, no image-to-text extraction.

3. **Large client-side pages need decomposition** — Several pages are oversized monoliths: `settings/page.tsx` (616 lines), `ingest/page.tsx` (513 lines), `graph/page.tsx` (442 lines), `query/page.tsx` (329 lines). These could be broken into focused sub-components for maintainability.

4. **No E2E or integration tests** — All 443 tests are unit tests against `src/lib/`. No tests exercise API routes, page rendering, or user flows. A smoke E2E test (even just hitting API routes with supertest or similar) would catch integration regressions.

5. **Streaming retry not implemented** — `llm.ts` has a TODO: "Add retry support for streaming. Streaming retries need different handling." Only `callLLM` retries; `callLLMStream` does not.

6. **Query re-ranking quality** — Multiple journal entries mention improving query re-ranking as a next step. The current pipeline is BM25 + optional vector search via RRF, but there's no LLM-based re-ranking step to improve relevance of the final page selection.

7. **Backlinks / "What links here"** — The graph view shows connections but individual wiki pages don't show incoming links. This is a core wiki affordance (Wikipedia's "What links here") that would help browsing.

8. **Graph clustering** — Journal mentions graph clustering as a future direction. The current graph is a flat force simulation; clustering by topic/category would improve navigation at scale.

### Medium-impact opportunities

9. **Keyboard shortcuts** — No keyboard navigation beyond what the browser provides. Common wiki UX: `/` to focus search, `n` for new page, `e` to edit.

10. **Plain-text ingest from file upload** — Currently supports URL or pasted text. File upload (drag-and-drop .txt, .md, .pdf) would lower friction for local documents.

11. **Pagination / virtual scrolling** — Wiki index, raw source list, and lint results all render full lists. Will degrade at scale (100+ pages).

12. **Export formats beyond Obsidian** — Only Obsidian zip export exists. JSON export, single-page HTML, or PDF could be useful.

## Bugs / Friction Found

1. **SCHEMA.md drift** — Contradiction auto-fix is implemented but SCHEMA.md still says "No auto-fix yet." This is exactly the kind of doc-code drift the learnings warn about.

2. **No `try/catch` grep is misleading but API routes do have error handling** — All API routes wrap their logic in try/catch. The earlier grep was counting `try` keywords, and all routes have at least 1. No actual bug here.

3. **`eslint-disable` in graph page** — `react-hooks/exhaustive-deps` suppressed in `graph/page.tsx`. The effect dependency list may be incomplete — worth auditing whether the suppression is justified or masking a stale-closure bug.

4. **Streaming TODO in llm.ts** — `callLLMStream` lacks retry logic. If the streaming provider fails mid-response, the user sees a broken stream with no recovery.

5. **Single-process file locking only** — `withFileLock` protects against concurrent operations within one Node.js process but not across multiple server instances. SCHEMA.md documents this limitation but it would bite anyone running multiple `pnpm dev` instances or deploying behind a load balancer.
