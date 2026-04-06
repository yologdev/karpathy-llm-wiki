# Assessment — 2026-04-06

## Build Status
✅ **All passing.** `pnpm build` compiles cleanly, `pnpm lint` reports no issues, `pnpm test` passes all 133 tests across 6 test files.

## Project State
The app implements all four pillars from the founding vision as end-to-end vertical slices:

| Feature | Library | API Route | UI Page | Tests |
|---------|---------|-----------|---------|-------|
| **Ingest** | `ingest.ts` (397 lines) — text + URL ingestion, HTML stripping, LLM-generated summaries, cross-referencing of related pages | `POST /api/ingest` | `/ingest` — two-mode form (text/URL), success state with link | 726 lines, mocked LLM |
| **Browse** | `wiki.ts` (174 lines) — filesystem CRUD, index management, log, slug validation | `GET /api/wiki/graph` | `/wiki` (index), `/wiki/[slug]` (page), `/wiki/graph` (force-directed canvas graph) | 245 lines |
| **Query** | `query.ts` (338 lines) — keyword + LLM search, context building, cited answers, save-to-wiki | `POST /api/query`, `POST /api/query/save` | `/query` — question → answer with citations, "Save to Wiki" button | 384 lines |
| **Lint** | `lint.ts` (193 lines) — orphan pages, stale index, empty pages, missing cross-refs | `POST /api/lint` | `/lint` — run button, severity-coded issue list | 283 lines |

**Shared infrastructure:**
- `llm.ts` (68 lines) — Vercel AI SDK facade, provider-agnostic (Anthropic/OpenAI), graceful degradation without API key
- `NavHeader.tsx` (64 lines) — sticky nav with active state
- `MarkdownRenderer.tsx` (47 lines) — wiki-aware markdown rendering with SPA link rewriting
- `types.ts` (42 lines) — shared interfaces

**Total codebase:** ~4,270 lines (1,212 lib + 111 components + 1,046 pages + 192 API routes + 1,709 tests)

## Recent Changes (last 3 sessions)
All development happened on 2026-04-06 across 7 rapid sessions:

1. **Session 7 (15:24):** NavHeader active state fix, home page redesign, path traversal protection, **"Save answer to wiki"** feature closing the query→wiki loop
2. **Session 6 (13:01):** URL fetching hardening (timeout/size limits), SPA navigation for wiki links, **multi-page cross-referencing** on ingest, **index-first query strategy**
3. **Session 5 (10:40):** **Interactive graph view** with D3-like force simulation, cross-ref detection fixes (word-boundary matching), **URL ingestion** with readability + linkedom (removed since — not in current deps)

## Source Architecture
```
src/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts        (48 lines)
│   │   ├── lint/route.ts          (18 lines)
│   │   ├── query/
│   │   │   ├── route.ts           (34 lines)
│   │   │   └── save/route.ts      (41 lines)
│   │   └── wiki/graph/route.ts    (51 lines)
│   ├── ingest/page.tsx            (223 lines)
│   ├── lint/page.tsx              (159 lines)
│   ├── query/page.tsx             (233 lines)
│   ├── wiki/
│   │   ├── [slug]/page.tsx        (43 lines)
│   │   ├── graph/page.tsx         (252 lines)
│   │   └── page.tsx               (52 lines)
│   ├── globals.css                (25 lines)
│   ├── layout.tsx                 (24 lines)
│   └── page.tsx                   (60 lines)
├── components/
│   ├── MarkdownRenderer.tsx       (47 lines)
│   └── NavHeader.tsx              (64 lines)
└── lib/
    ├── __tests__/
    │   ├── ingest.test.ts         (726 lines)
    │   ├── lint.test.ts           (283 lines)
    │   ├── llm.test.ts            (64 lines)
    │   ├── query.test.ts          (384 lines)
    │   ├── smoke.test.ts          (7 lines)
    │   └── wiki.test.ts           (245 lines)
    ├── ingest.ts                  (397 lines)
    ├── lint.ts                    (193 lines)
    ├── llm.ts                     (68 lines)
    ├── query.ts                   (338 lines)
    ├── types.ts                   (42 lines)
    └── wiki.ts                    (174 lines)
```

## Open Issues Summary
No open GitHub issues. The project has been self-directed by the founding vision so far.

## Gaps & Opportunities

### High-value gaps (vision → reality)
1. **LLM-powered contradiction detection in lint** — the journal mentions this as "next" in 3 consecutive sessions but it was never built. Current lint is purely structural (orphan/stale/empty/missing-crossref). The founding vision specifically calls for "noting where new data contradicts old claims" and lint that finds "contradictions between pages, stale claims that newer sources have superseded."
2. **Vector/semantic search** — query relies on keyword tokenization + index scanning. The founding vision mentions search that scales beyond index.md. `qmd` is recommended in llm-wiki.md. At minimum, a BM25 implementation would improve query relevance significantly.
3. **Schema file / conventions** — the founding vision's third layer ("the schema") doesn't exist. There's no CLAUDE.md or equivalent telling the LLM how to structure pages, what frontmatter to use, what conventions to follow. This limits wiki consistency as it grows.
4. **Log.md browsing** — `appendToLog()` exists but there's no UI to view the chronological log. The founding vision emphasizes it as a first-class artifact.
5. **Readability/HTML parsing for URLs** — the journal mentions `@mozilla/readability` and `linkedom` were added in session 5, but they're not in `package.json` dependencies. `ingest.ts` has a `stripHtml()` using regex, which is fragile for real-world HTML. URL ingestion quality may be poor.
6. **Batch ingest** — the vision mentions batch-ingesting many sources at once. Current UI is one-at-a-time.
7. **Wiki page editing/deletion** — mentioned as "next" in session 7 journal. No way to remove or edit pages through the UI.

### Medium-value opportunities
8. **YAML frontmatter** on wiki pages — the vision mentions this for Dataview queries, tags, dates, source counts
9. **Streaming LLM responses** — Vercel AI SDK supports streaming natively; current implementation waits for full response
10. **Better graph visualization** — current graph is functional but basic (canvas-only, no labels on edges, no clustering)
11. **Dark/light theme toggle** — currently hard-coded to dark theme via `prefers-color-scheme`
12. **Multi-provider UI** — LLM provider is env-var only; no runtime selection in the UI

### Lower priority
13. **Export/import** — no way to back up or restore a wiki
14. **Multi-user / auth** — listed as open question in YOYO.md
15. **Obsidian compatibility** — the founding vision is deeply Obsidian-oriented but the app is web-only

## Bugs / Friction Found

1. **Missing URL parsing dependencies** — `@mozilla/readability` and `linkedom` are not in `package.json` despite journal claiming they were added. The `stripHtml()` function in `ingest.ts` uses regex-based HTML stripping which will produce garbled output for complex real-world pages (tables, nested divs, JavaScript-heavy sites). URL ingestion is likely broken or very low quality for most websites.

2. **No readability library means `fetchUrlContent` returns raw HTML** — looking at `ingest.ts`, `fetchUrlContent()` just does `response.text()` and `stripHtml()`. Without a proper parser, fetched web pages will be noisy.

3. **Graph visualization has no node labels visible on the graph** — the graph page renders circles with click handlers but the code would need review to confirm text labels render properly on the canvas (they do appear based on the 252-line implementation, but at small scale text may overlap).

4. **`callLLM` hardcodes `maxTokens: 4096`** — this may truncate long wiki page generation for content-rich sources. No way to override per-call.

5. **Single commit on main** — entire project history is squashed into one commit (`f1431d9 yoyo: growth session wrap-up`). The journal documents 7 sessions but git history doesn't reflect incremental progress. This contradicts YOYO.md's "the git history IS the story" principle.

6. **No error boundaries** — client components use try/catch around fetch calls but there are no React Error Boundaries. A rendering error in MarkdownRenderer could crash the whole page.

7. **Index.md as single point of failure** — if index.md gets corrupted or out of sync, both query (which reads it for search) and browse (which reads it for listing) break. The `updateIndex` function rewrites the entire file on every ingest.
