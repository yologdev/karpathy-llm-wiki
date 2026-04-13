# Assessment — 2026-04-13

## Build Status

**Pass.** `pnpm build` succeeds with 28 routes, zero type errors. `pnpm test` passes all 564 tests across 12 test files. Build emits expected ENOENT warnings for missing `wiki/index.md` and `wiki/log.md` during static generation (non-fatal — the code handles absent wiki dirs gracefully). Tests emit stderr noise from intentional ENOENT paths in query and query-history tests (expected behavior, not failures).

## Project State

The app is feature-complete against the founding vision's four pillars:

| Pillar | Status | Key capabilities |
|--------|--------|-----------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking (12K chars/chunk), human-in-the-loop preview, SSRF hardening, raw source persistence |
| **Query** | ✅ | Hybrid BM25 + optional vector search (RRF fusion), streaming responses, LLM-powered page selection, citation extraction, save-answer-to-wiki, query history |
| **Lint** | ✅ | 7 checks (orphan, stale-index, empty, broken-link, missing-crossref, contradiction, missing-concept-page), all with auto-fix including LLM-powered contradiction resolution |
| **Browse** | ✅ | Wiki index with search/filter/tags, page view with backlinks, edit/delete/create, interactive canvas graph, log viewer, raw source browser, global full-text search, Obsidian export |

**Infrastructure:** Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), settings UI with JSON config persistence, provider-agnostic embeddings, file locking, error boundaries on all routes, mobile-responsive nav.

**Codebase:** ~19,400 lines total (4,960 lib, 7,400 tests, 4,300 pages/routes, 1,470 components).

## Recent Changes (last 3 sessions)

From journal + git:

1. **2026-04-12 20:28** — Bug fixes: ENOENT crash on delete, TOCTOU race in lifecycle.ts, missing accessibility attributes. Performance: page cache in lint, GlobalSearch dedup.
2. **2026-04-12 16:30** — Link dedup into `links.ts` module, `isRetryableError` false-positive fix (regex matching LLM output), SSRF redirect-bypass hardening, streaming body size checks.
3. **2026-04-12 12:44** — Bare catch block sweep (explicit `catch (err: unknown)` + narrowing across 7 files), `findBacklinks` regex injection fix, `fromCharCode` misuse fix in HTML entity decoding.

**Trend:** Sessions 1–6 built vertical slices. Sessions 7–21 shifted to hardening, dedup, and bug-fixing. No major new features in recent sessions — the project is in polish mode.

## Source Architecture

```
src/
├── lib/                          # Core logic (4,960 lines)
│   ├── ingest.ts          (850)  # URL fetch, HTML cleanup, LLM page generation, chunking
│   ├── wiki.ts            (654)  # Filesystem ops, index, log, search, backlinks, page cache
│   ├── lint.ts            (571)  # 7 lint checks incl. LLM contradiction detection
│   ├── query.ts           (545)  # BM25, vector search, RRF fusion, LLM synthesis
│   ├── lint-fix.ts        (452)  # Auto-fix handlers for all lint issue types
│   ├── embeddings.ts      (449)  # Provider-agnostic vector store, cosine similarity
│   ├── config.ts          (355)  # Settings persistence, env var resolution, caching
│   ├── lifecycle.ts       (339)  # Write/delete pipeline (index, log, embeddings, cross-refs)
│   ├── llm.ts             (330)  # Multi-provider LLM calls, retry with backoff
│   ├── frontmatter.ts     (267)  # YAML frontmatter parse/serialize
│   ├── query-history.ts   (129)  # Query history persistence
│   ├── raw.ts             (125)  # Raw source CRUD
│   ├── types.ts            (74)  # Shared type definitions
│   ├── constants.ts        (72)  # Tuning parameters (BM25, timeouts, limits)
│   ├── lock.ts             (61)  # In-process file locking
│   ├── providers.ts        (46)  # Provider info constants
│   ├── links.ts            (44)  # Wiki link extraction/detection
│   ├── export.ts           (27)  # Obsidian link conversion
│   ├── citations.ts        (21)  # Citation slug extraction
│   └── slugify.ts          (18)  # Slug generation
│
├── lib/__tests__/                # Test suite (7,400 lines, 564 tests)
│   ├── wiki.test.ts      (1782)
│   ├── ingest.test.ts    (1610)
│   ├── lint.test.ts      (1014)
│   ├── query.test.ts     (1009)
│   ├── embeddings.test.ts (993)
│   ├── lint-fix.test.ts   (656)
│   ├── llm.test.ts        (432)
│   ├── config.test.ts     (334)
│   ├── query-history.test.ts (202)
│   ├── export.test.ts      (65)
│   ├── slugify.test.ts     (50)
│   └── smoke.test.ts       (18)
│
├── app/                          # Next.js pages + API routes (4,300 lines)
│   ├── page.tsx            (95)  # Home dashboard
│   ├── ingest/page.tsx    (516)  # Ingest form + preview
│   ├── query/page.tsx     (507)  # Query interface + streaming
│   ├── lint/page.tsx      (348)  # Lint results + auto-fix
│   ├── settings/page.tsx  (616)  # Provider/model config
│   ├── wiki/              (853)  # Browse: index, detail, edit, new, graph, log
│   ├── raw/               (174)  # Raw source browser
│   └── api/              (1,100) # 14 route files, 28 handlers
│
└── components/                   # React components (1,470 lines)
    ├── GlobalSearch.tsx    (346)
    ├── BatchIngestForm.tsx (316)
    ├── WikiIndexClient.tsx (249)
    ├── NavHeader.tsx       (215)
    ├── WikiEditor.tsx       (96)
    ├── StatusBadge.tsx      (91)
    ├── MarkdownRenderer.tsx (59)
    ├── DeletePageButton.tsx (55)
    └── ErrorBoundary.tsx    (45)
```

## Open Issues Summary

No open GitHub issues. The repository has zero open issues as of this assessment.

## Gaps & Opportunities

### vs. llm-wiki.md founding vision

1. **Image/asset handling** — The founding vision mentions downloading images locally and having the LLM view them. Currently, images in source HTML are stripped during ingest. No asset pipeline exists.
2. **Marp slide deck generation** — Vision mentions generating presentations from wiki content. Not implemented.
3. **Dataview-style queries** — Vision mentions running queries over page frontmatter (tags, dates, source counts). Frontmatter exists but no query interface for it.
4. **CLI tools** — Vision recommends building small CLI tools for efficient wiki operations. Only the web UI exists; no `npx llm-wiki ingest <url>` or similar.

### vs. YOYO.md direction

5. **Graph view clustering** — Mentioned as "next" in 8+ consecutive journal entries but never built. The current graph is a raw force simulation with no semantic grouping.
6. **Query re-ranking quality** — Also mentioned repeatedly as "next" but never addressed. LLM page selection can override better BM25+vector fusion results.
7. **No toast/notification system** — Operations complete silently or via inline state changes. No unified feedback mechanism.
8. **No keyboard shortcuts** — Power users have no accelerators.

### Performance & Scale concerns

9. **`listWikiPages()` reads ALL pages from disk on every call** — called from query, ingest, lint, home page, wiki index, graph, global search. Each call does N filesystem reads + YAML parses. No caching outside `withPageCache` (which only lint uses).
10. **Query does 2N disk reads** — `listWikiPages()` + `buildCorpusStats(fullBody: true)` both read every page independently.
11. **`checkMissingCrossRefs` is O(N²)** — for each page, regex-matches every other page's title. At 100 pages → 10K regex compilations.
12. **Graph simulation is O(N²)** — no Barnes-Hut/quadtree. Will jank at 50+ pages.
13. **No request-level page cache in query or ingest** — `withPageCache` pattern exists but isn't used.

## Bugs / Friction Found

### Real bugs

1. **`updateRelatedPages` uses `content.includes()` instead of `hasLinkTo()` from `links.ts`** — can false-positive when slugs appear in prose. The correct utility already exists and is used in `findBacklinks` but not here. (`wiki.ts`)

2. **`saveVectorStore` is NOT atomic** — uses raw `fs.writeFile`. Crash mid-write corrupts the vector store. `saveConfig` already demonstrates the correct pattern (write-tmp-then-rename). (`embeddings.ts`)

3. **`embedText` sends entire page content as single embedding input** — no truncation or chunking. Long pages will exceed embedding model token limits (e.g., OpenAI's 8191 token limit), causing silent truncation or errors. (`embeddings.ts`)

4. **`searchByVector` doesn't filter by embedding model** — if the user switches providers, stale embeddings from the old model are compared against new query embeddings, producing meaningless similarity scores. (`embeddings.ts`)

5. **`stripBacklinksTo` can leave orphaned commas** — removing a middle link from "See also: A, B, C" produces "See also: A, , C". The trailing-comma regex only catches end-of-line commas. (`lifecycle.ts`)

6. **`checkMissingConceptPages` reads only first 500 chars per page** — for pages with YAML frontmatter, this may be almost entirely frontmatter, giving the LLM minimal actual content to analyze. (`lint.ts`)

7. **Graph canvas doesn't account for `devicePixelRatio`** — renders blurry on Retina/HiDPI displays. (`wiki/graph/page.tsx`)

### Accessibility gaps

8. **Graph canvas has no `role`, `aria-label`, or keyboard navigation** — completely inaccessible to screen reader and keyboard users. No text alternative pointing to the wiki index.

9. **NavHeader settings gear SVG lacks `aria-hidden="true"`** — screen readers may try to announce the SVG path data.

10. **Mobile menu has no click-outside-to-close and no focus trap** — Tab can escape to elements behind the menu.

### Code quality

11. **No timeout on `generateText` calls in `callLLM`** — a hung LLM provider blocks indefinitely with no abort signal.

12. **`getEffectiveSettings` doesn't report `EMBEDDING_MODEL` env var** — the effective settings display misses this config source even though `getEmbeddingModelName()` checks it.

13. **`lint.ts` `buildClusters` drops excess nodes from dense graphs** — global visited set means nodes exceeding `maxClusterSize` in a large connected component are silently excluded from ALL clusters, missing potential contradictions.
