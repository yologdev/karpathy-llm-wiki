# Assessment — 2026-04-12

## Build Status
**PASS** — `pnpm build` compiles cleanly (28 routes, no type errors). `pnpm test` passes 503 tests across 12 test files in ~4s.

## Project State
The app is a fully functional Next.js 15 web application implementing all four pillars from the founding vision:

- **Ingest** — URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking for long docs, human-in-the-loop preview, raw source persistence. ~650 lines of core logic.
- **Query** — BM25 + optional vector search (RRF fusion), streaming responses, citation extraction, save-answer-to-wiki loop, query history persistence. ~540 lines.
- **Lint** — 5 checks (orphan, stale-index, empty, missing-crossref, contradiction) + missing-concept-page detection, all with LLM-powered auto-fix paths. ~925 lines across lint.ts + lint-fix.ts.
- **Browse** — Wiki index with search/filter, individual page view with backlinks, edit/delete/create flows, interactive D3 force graph, log viewer, raw source browser, global search, Obsidian export.

Supporting infrastructure: multi-provider LLM (Anthropic/OpenAI/Google/Ollama via Vercel AI SDK), settings UI with config persistence, embedding/vector store, file locking, YAML frontmatter, lifecycle pipeline, error boundaries on all routes, mobile-responsive nav.

**Total codebase:** ~18,100 lines (4,960 lib core, 7,400 tests, 4,300 pages/routes, 1,470 components).

## Recent Changes (last 3 sessions)
From journal.md (git log shows a single squashed commit):

1. **2026-04-12 05:50** — Missing-concept-page lint check + LLM auto-fix, error boundary dedup into shared `PageError` component.
2. **2026-04-12 01:56** — Query history persistence, full-text global search upgrade, slugify consolidation.
3. **2026-04-11 20:24** — Content-Type validation on URL fetch, lightweight wiki list endpoint for GlobalSearch, vector store file locking.

Theme: the last several sessions have been refinement/hardening — no major new features, lots of polish, dedup, and resilience improvements.

## Source Architecture

```
src/
├── lib/                          # Core logic (4,964 lines)
│   ├── ingest.ts         (652)   # URL fetch, HTML cleanup, LLM page gen, chunking
│   ├── wiki.ts           (570)   # Filesystem ops, index, log, search, backlinks
│   ├── query.ts          (536)   # BM25, vector search, RRF, LLM synthesis
│   ├── lint.ts           (535)   # 5 lint checks + contradiction/concept detection
│   ├── embeddings.ts     (447)   # Vector store, embedding providers, cosine sim
│   ├── lint-fix.ts       (390)   # Auto-fix handlers for all lint issue types
│   ├── config.ts         (353)   # Settings persistence, provider resolution
│   ├── lifecycle.ts      (327)   # Write/delete pipeline (index, log, embeddings, xrefs)
│   ├── llm.ts            (314)   # Provider-agnostic LLM calls, retry, streaming
│   ├── frontmatter.ts    (267)   # YAML frontmatter parse/serialize
│   ├── query-history.ts  (129)   # Query history persistence
│   ├── raw.ts            (125)   # Raw source save/list/read
│   ├── types.ts           (74)   # Shared interfaces
│   ├── constants.ts       (72)   # Centralized magic numbers
│   ├── lock.ts            (61)   # In-process file locking
│   ├── providers.ts       (46)   # Provider info/labels
│   ├── export.ts          (27)   # Obsidian wikilink converter
│   ├── citations.ts       (21)   # Citation slug extraction
│   └── slugify.ts         (18)   # Slug generation
│
├── lib/__tests__/                # Tests (7,405 lines, 503 tests)
│   ├── wiki.test.ts     (1613)
│   ├── ingest.test.ts   (1298)
│   ├── embeddings.test.ts (993)
│   ├── query.test.ts     (998)
│   ├── lint.test.ts       (821)
│   ├── lint-fix.test.ts   (656)
│   ├── llm.test.ts        (357)
│   ├── config.test.ts     (334)
│   ├── query-history.test.ts (202)
│   ├── export.test.ts      (65)
│   ├── slugify.test.ts     (50)
│   └── smoke.test.ts       (18)
│
├── app/                          # Pages & API routes (4,299 lines)
│   ├── page.tsx           (95)   # Home dashboard
│   ├── ingest/page.tsx   (513)   # Ingest form + preview
│   ├── query/page.tsx    (505)   # Query interface + history
│   ├── lint/page.tsx     (327)   # Lint results + auto-fix
│   ├── settings/page.tsx (616)   # Provider config UI
│   ├── wiki/                     # Browse
│   │   ├── page.tsx       (23)   # Wiki index
│   │   ├── [slug]/page.tsx (139) # Page view w/ backlinks
│   │   ├── [slug]/edit/   (44)   # Edit flow
│   │   ├── graph/page.tsx (442)  # Force-directed graph
│   │   ├── new/page.tsx  (142)   # Create page
│   │   └── log/page.tsx   (31)   # Activity log
│   ├── raw/                      # Source browsing
│   │   ├── page.tsx       (88)
│   │   └── [slug]/page.tsx (86)
│   └── api/                      # 14 API routes
│       ├── ingest/route.ts, batch/route.ts
│       ├── query/route.ts, stream/route.ts, save/route.ts, history/route.ts
│       ├── lint/route.ts, fix/route.ts
│       ├── wiki/route.ts, [slug]/route.ts, graph/route.ts, search/route.ts, export/route.ts
│       ├── raw/[slug]/route.ts
│       ├── settings/route.ts, rebuild-embeddings/route.ts
│       └── status/route.ts
│
└── components/                   # UI components (1,465 lines)
    ├── GlobalSearch.tsx   (339)
    ├── BatchIngestForm.tsx (316)
    ├── WikiIndexClient.tsx (249)
    ├── NavHeader.tsx      (215)
    ├── WikiEditor.tsx      (96)
    ├── StatusBadge.tsx     (91)
    ├── MarkdownRenderer.tsx (59)
    ├── DeletePageButton.tsx (55)
    └── ErrorBoundary.tsx   (45)
```

## Open Issues Summary
| # | Title | Labels |
|---|-------|--------|
| 3 | Status report: what's built, what's next, and propose a reporting structure | `agent-input` |

Only one open issue — asking for a status report and a proposal for ongoing reporting structure. No feature requests or bug reports from the community.

## Gaps & Opportunities

### vs. Founding Vision (llm-wiki.md)
1. **No image/asset handling** — Images in source HTML are dropped during ingest. The vision mentions downloading images locally and having the LLM reference them.
2. **No Marp/slide deck output** — The vision mentions generating presentations from wiki content.
3. **No Dataview-style dynamic queries** — The vision mentions frontmatter-driven tables and lists.
4. **No multi-user / auth** — Listed as an open question in YOYO.md.
5. **Schema co-evolution is manual** — SCHEMA.md drifts from code and needs periodic manual syncing (multiple journal entries mention this).

### vs. YOYO.md Direction
6. **No CLI tool / Obsidian plugin** — YOYO.md lists these as open questions. Export exists but not a real plugin.
7. **No vector search for Anthropic users** — The most common provider has no embedding API. Pure BM25 fallback works but is a significant capability gap.

### Architecture & Code Quality
8. **Redundant disk reads** — `listWikiPages()`, `buildCorpusStats()`, lint checks all independently re-read every page from disk. No caching layer.
9. **Lifecycle race condition** — `listWikiPages()` happens outside the `withFileLock` in lifecycle.ts, creating TOCTOU potential on concurrent operations.
10. **Silent error swallowing** — Multiple catch blocks across query.ts, lint.ts, wiki.ts discard errors silently. Debugging production issues will be painful.
11. **NavHeader duplicates desktop/mobile link rendering** — Same links rendered twice with different styling.
12. **Graph view accessibility** — Canvas-based, no keyboard nav, no screen reader support, blurry on Retina (no DPR handling).
13. **Duplicate JSON response parsers** in lint.ts — `parseContradictionResponse` and `parseMissingConceptResponse` share nearly identical structure.
14. **Sequential LLM calls** in lint — contradiction and missing-concept checks could be parallelized.

### UX Gaps
15. **No onboarding walkthrough** — Empty-state exists on home page but no guided first-ingest experience.
16. **No notification/toast system** — Operations succeed/fail silently or via inline messages only.
17. **No keyboard shortcuts** — Power users have no quick-access patterns.
18. **Graph view has no clustering** — Mentioned as "next" in many journal entries but never built.

## Bugs / Friction Found
- **lifecycle.ts TOCTOU race**: `listWikiPages()` reads index outside the file lock, so concurrent writes could clobber each other's index updates.
- **lifecycle.ts "fire-and-forget" comment is misleading**: Embedding ops are actually `await`ed (just wrapped in try/catch), blocking the pipeline despite the comment.
- **graph page doesn't check `r.ok` before `.json()`**: Non-200 API responses will produce opaque parse errors.
- **`findBacklinks` doesn't escape slug in regex**: Safe only because `validateSlug` restricts characters, but defense-in-depth is missing.
- **`searchWikiContent` bypasses `readWikiPage()`**: Reads files directly, duplicating slug derivation and skipping validation.
- **`eslint-disable` in graph page**: Suppressed exhaustive-deps warning for `simulate` callback — potential stale closure.
- **Graph canvas hardcodes height `560` in three places** — should be a constant.
- **Empty query string** not guarded in `searchIndex` — triggers wasteful zero-score computation.
