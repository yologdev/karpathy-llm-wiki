# Assessment — 2026-04-06

## Build Status
**PASS** — `pnpm build` compiles successfully (Next.js production build), `pnpm test` passes all 9 tests across 2 test files (smoke + wiki.ts unit tests).

## Project State
The app has a functional skeleton covering three of the four core operations (ingest, query, browse). ~1,060 lines of TypeScript/TSX across 17 source files.

**Pages (5):**
- `/` — Landing page with CTAs to ingest, query, and browse
- `/ingest` — Client-side form (title + content textarea), POSTs to API
- `/query` — Client-side question form, renders markdown answers with cited sources
- `/wiki` — Server component listing all wiki pages from `index.md`
- `/wiki/[slug]` — Server component displaying individual wiki page with markdown rendering

**API Routes (2):**
- `POST /api/ingest` — Validates input, calls `ingest()`, returns result
- `POST /api/query` — Validates input, calls `query()`, returns answer + sources

**Core Library (5 files, ~390 lines):**
- `wiki.ts` (132 lines) — Filesystem ops: read/write pages, index management, raw source saving, log appending
- `ingest.ts` (97 lines) — Slugify + ingest pipeline: save raw → LLM summarize → write wiki page → update index → log
- `query.ts` (98 lines) — Context-stuffing query: load all wiki pages → LLM answer → extract cited slugs
- `llm.ts` (36 lines) — Thin Anthropic Claude wrapper (claude-sonnet-4-20250514, 4096 tokens)
- `types.ts` (27 lines) — WikiPage, IndexEntry, IngestResult, QueryResult interfaces

**Components (1):**
- `MarkdownRenderer` — react-markdown with remark-gfm, rewrites internal `.md` links to `/wiki/slug` routes

**Tests (2 files, 9 tests):**
- `smoke.test.ts` — Vitest sanity check
- `wiki.test.ts` — Comprehensive tests for all wiki.ts functions using temp directories

**Graceful degradation:** Both ingest and query have fallback paths when `ANTHROPIC_API_KEY` is not set (stub pages / helpful error messages).

## Recent Changes (last 3 sessions)
Only 2 sessions so far (project is brand new):

1. **Session 2 (2026-04-06 08:33)** — Built query operation, MarkdownRenderer component, ingest form UI. Completed the full ingest→browse→query loop.
2. **Session 1 (2026-04-06 07:46)** — Bootstrap: scaffolded Next.js 15 project, built core library layer (wiki.ts, llm.ts), ingest API route, basic browse UI at `/wiki`.

Git log shows only 1 commit visible (likely squashed/synced): `9eb5af0 sync journal to journals/llm-wiki.md in yoyo-evolve`

## Source Architecture
```
src/                          (~1,060 lines total)
├── app/
│   ├── api/
│   │   ├── ingest/route.ts        42 lines  — POST handler
│   │   └── query/route.ts         34 lines  — POST handler
│   ├── ingest/page.tsx           153 lines  — Ingest form (client)
│   ├── query/page.tsx            117 lines  — Query form (client)
│   ├── wiki/
│   │   ├── page.tsx               52 lines  — Wiki index (server)
│   │   └── [slug]/page.tsx        43 lines  — Wiki page view (server)
│   ├── page.tsx                   36 lines  — Landing page
│   ├── layout.tsx                 20 lines  — Root layout
│   └── globals.css                25 lines  — Tailwind + dark mode
├── components/
│   └── MarkdownRenderer.tsx       36 lines  — Markdown with link rewriting
└── lib/
    ├── __tests__/
    │   ├── smoke.test.ts           7 lines
    │   └── wiki.test.ts          132 lines
    ├── types.ts                   27 lines
    ├── wiki.ts                   132 lines
    ├── ingest.ts                  97 lines
    ├── query.ts                   98 lines
    └── llm.ts                     36 lines
```

## Open Issues Summary
No open issues on the repository (`gh issue list` returned empty `[]`).

## Gaps & Opportunities

### High Priority (core vision gaps)
1. **Lint operation missing** — The founding vision calls for three operations (ingest, query, lint). Lint is not implemented at all — no contradiction detection, no orphan page detection, no missing cross-reference checking. This is the biggest functional gap.
2. **URL ingest not supported** — YOYO.md says "paste a URL or text" but only text ingest works. No URL fetching, no HTML-to-markdown conversion.
3. **log.md viewing** — The wiki maintains a log file per the vision, but there's no UI to browse it.
4. **Ingest doesn't update existing wiki pages** — The vision says ingesting a source should "update relevant entity and concept pages across the wiki" (touching 10-15 pages). Current implementation only creates one new page per ingest — no cross-referencing, no updating existing pages.

### Medium Priority (quality & scalability)
5. **No tests for ingest.ts, query.ts, or llm.ts** — Only wiki.ts has unit tests. Coverage gap.
6. **Query loads ALL pages into context** — Will hit token limits with a large wiki. No retrieval/chunking strategy.
7. **No graph view** — YOYO.md mentions "graph view" for browsing. Not implemented.
8. **Summary extraction is fragile** — `content.split(/[.\n]/)[0]` can produce meaningless summaries.
9. **Re-ingest stale index** — Re-ingesting same slug overwrites the page but leaves stale title/summary in index.

### Lower Priority (polish & infrastructure)
10. **No navigation/header** — Pages have back links but no consistent site navigation.
11. **No search within wiki** — Only browse-by-index. No text search.
12. **Hardcoded LLM model** — claude-sonnet-4-20250514 not configurable.
13. **No concurrency protection** — Concurrent writes to index.md/log.md could corrupt data.
14. **No authentication** — API routes are open (acceptable for local-first MVP).

## Bugs / Friction Found

1. **No actual bugs** — Build passes clean, all tests pass, no TypeScript errors.
2. **Minor: Summary derivation** — `content.split(/[.\n]/)[0]` in ingest.ts splits on first period OR newline, which often produces a one-word or partial summary. Should at minimum use the first sentence.
3. **Minor: New Anthropic client per LLM call** — `llm.ts` creates a new `Anthropic()` instance on every `callLLM()` invocation instead of reusing a singleton. Not a bug but wasteful.
4. **Minor: No error boundary in client pages** — API failures show error text but no retry mechanism or structured error handling in the ingest/query UIs.
