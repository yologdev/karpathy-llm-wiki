# Assessment — 2026-04-06

## Build Status
**All green.** `pnpm build` compiles successfully (Next.js 15.5.14), `pnpm lint` clean, `pnpm test` passes 106/106 tests across 6 test files.

## Project State
The app implements all four pillars from the founding vision — **ingest, query, lint, browse** — end-to-end with library → API route → UI for each. The core loop works: paste content or a URL, LLM generates wiki pages with cross-references, browse the wiki, ask questions with cited answers, lint for issues. Multi-provider LLM support via Vercel AI SDK (Anthropic, OpenAI). ~3,768 lines of TypeScript across 27 source files.

### What exists:
- **Ingest** (`/ingest`): text or URL input, HTML stripping via regex, LLM summary generation, slug deduplication, multi-page cross-referencing of related pages, raw source preservation
- **Browse** (`/wiki`, `/wiki/[slug]`, `/wiki/graph`): index page listing all pages, individual page rendering via react-markdown, interactive D3-style force-directed graph view on canvas
- **Query** (`/query`): index-first search strategy, keyword + LLM-ranked page selection, context-aware answers with citations
- **Lint** (`/lint`): orphan detection, missing cross-references, empty/stub pages, stale index entries
- **Navigation**: persistent NavHeader across all pages
- **Tests**: 106 tests covering all library modules — ingest (with mocked fetch/LLM), query, lint, wiki filesystem ops, LLM key detection

## Recent Changes (last 3 sessions)
1. **Session 6 (latest)**: Multi-page ingest with cross-referencing of related pages, index-first query strategy, URL fetch hardening (timeout, size limits, domain validation), SPA navigation for wiki links
2. **Session 5**: Interactive graph view with D3 force simulation, cross-ref detection fix (word-boundary matching), LintIssue type deduplication, URL ingestion with `@mozilla/readability` and `linkedom` (note: these packages aren't in package.json — `stripHtml` is actually regex-based)
3. **Session 4**: Vercel AI SDK migration from `@anthropic-ai/sdk`, slug deduplication, resilient summary extraction, LLM provider integration test

## Source Architecture
```
src/ (3,768 lines total)
├── lib/                          # Core logic
│   ├── types.ts          (42)    # Interfaces: WikiPage, IndexEntry, IngestResult, QueryResult, LintIssue, LintResult
│   ├── wiki.ts          (132)    # Filesystem ops: read/write pages, index management, raw source storage, logging
│   ├── llm.ts            (68)    # Multi-provider LLM wrapper via Vercel AI SDK (Anthropic/OpenAI)
│   ├── ingest.ts        (391)    # Full ingest pipeline: slugify, URL fetch, HTML strip, LLM summarize, cross-reference
│   ├── query.ts         (274)    # Index search, context building, LLM-powered Q&A with citations
│   ├── lint.ts          (193)    # Health checks: orphans, empty pages, missing cross-refs, stale entries
│   └── __tests__/      (1506)    # 6 test files, 106 tests total
├── app/                          # Next.js App Router pages & API routes
│   ├── layout.tsx        (24)    # Root layout with NavHeader
│   ├── page.tsx          (18)    # Homepage
│   ├── globals.css       (25)    # Tailwind v4 config + dark mode colors
│   ├── ingest/page.tsx  (223)    # Ingest form UI (text/URL mode toggle)
│   ├── query/page.tsx   (117)    # Query form with markdown-rendered answers
│   ├── lint/page.tsx    (159)    # Lint results with severity badges
│   ├── wiki/
│   │   ├── page.tsx      (52)    # Wiki index (server component)
│   │   ├── [slug]/page.tsx (43)  # Individual wiki page viewer
│   │   └── graph/page.tsx (252)  # Canvas-based force-directed graph
│   └── api/
│       ├── ingest/route.ts (48)  # POST: ingest text or URL
│       ├── query/route.ts  (34)  # POST: ask a question
│       ├── lint/route.ts   (18)  # POST: run lint checks
│       └── wiki/graph/route.ts (51) # GET: graph data (nodes + edges)
└── components/
    ├── NavHeader.tsx     (51)    # Persistent navigation bar
    └── MarkdownRenderer.tsx (47) # react-markdown with wiki link rewriting
```

## Open Issues Summary
**No open GitHub issues.** The repo is community-facing but hasn't received external feature requests yet.

## Gaps & Opportunities

### High-Impact Gaps (relative to llm-wiki.md vision)
1. **No log.md integration** — the founding vision describes `log.md` as a chronological record of all operations. `appendToLog` exists in wiki.ts but there's no UI to view the log, and it's unclear if query/lint operations are logged.
2. **No "file answer back to wiki"** — the vision explicitly says "good answers can be filed back into the wiki as new pages." The query UI shows answers but offers no way to save them.
3. **No schema/conventions file** — the vision's third layer is "the schema" (CLAUDE.md / AGENTS.md) that tells the LLM how the wiki is structured. Nothing like this exists yet.
4. **No batch ingest** — vision mentions batch-ingesting many sources at once.
5. **No LLM-powered contradiction detection** — lint checks are all heuristic (orphans, stubs, missing refs). The vision emphasizes "noting where new data contradicts old claims."
6. **No vector search** — query relies on keyword matching + LLM re-ranking of index entries. YOYO.md mentions vector search as a next step.

### Medium-Impact Gaps
7. **No delete/edit operations** — pages can only be created/updated through ingest; no manual editing or deletion.
8. **No streaming responses** — query and ingest wait for full LLM response. Vercel AI SDK supports `streamText` natively.
9. **No search on browse** — wiki index page is a flat list with no filtering.
10. **Graph doesn't scale** — O(n²) physics, no zoom/pan, hardcoded canvas size.
11. **No page metadata** — no generateMetadata for individual wiki pages.
12. **Duplicated fetch/loading/error patterns** across all client pages — no shared hook or component.

### Polish & Robustness
13. **No path traversal protection** in wiki.ts — `readWikiPage`/`writeWikiPage` accept arbitrary slugs.
14. **No file locking** — concurrent ingests could corrupt index.md.
15. **No rate limiting or auth** on API routes.
16. **Hardcoded dark theme** — graph canvas, nav bar, CSS all assume dark mode with no light mode support.
17. **No mobile-responsive nav** — links could overflow on small screens.

## Bugs / Friction Found

### Bugs
1. **Journal mentions `@mozilla/readability` and `linkedom`** for URL processing, but these packages aren't in package.json. The actual `stripHtml` in ingest.ts is regex-based. This isn't a runtime bug but indicates a discrepancy — either the packages were removed or never actually integrated. The HTML stripping is basic and will fail on complex pages.
2. **Lint page links to stale-index slugs** — clicking a "stale index entry" lint issue navigates to `/wiki/[slug]` which will show "Page not found" (since the page doesn't exist — that's what makes the entry stale).
3. **NavHeader shows both "Browse" and "Graph" as active** on `/wiki/graph` — the `startsWith` check for `/wiki` matches both items.
4. **`slugify("")` returns `""`** — would create a `.md` file with no name. No guard against empty slug in the ingest pipeline.
5. **Titles ≤ 2 chars** (like "AI") are silently skipped in cross-reference checks in lint.ts.

### Friction
6. **No loading spinner** on ingest — just text "Processing..." which gives no feedback during long LLM calls.
7. **Home page has no actionable links** — just tells users to "use the navigation above."
8. **No confirmation or preview** before ingest overwrites an existing page.
9. **`checkEmptyPages` and `checkMissingCrossRefs` in lint both read every page independently** — duplicated filesystem I/O.
10. **`buildContext` in query loads pages sequentially** — could be parallelized.
