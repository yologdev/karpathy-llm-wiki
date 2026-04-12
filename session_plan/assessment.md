# Assessment — 2026-04-12

## Build Status
✅ `pnpm build` passes (all pages compile, static + dynamic routes generated)
✅ `pnpm test` passes — 10 test files, 457 tests, 0 failures (3.35s)

## Project State
The app implements all four pillars from the founding vision: **ingest**, **query**, **lint**, and **browse**. It's a full-featured Next.js 15 web app (16,674 lines of TypeScript across 80 files) with:

**Core operations:**
- Ingest — URL fetch (Readability + linkedom), text paste, batch ingest, human-in-the-loop preview, content chunking for long docs
- Query — BM25 + optional vector search (RRF fusion), streaming responses, save-answer-to-wiki
- Lint — 5 checks (orphan, stale-index, empty, missing-crossref, contradiction) all with auto-fix
- Browse — wiki index with search/filter, individual pages with backlinks, graph view, raw source browsing

**Infrastructure:**
- Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama)
- Settings UI with config persistence (JSON file), env var fallback
- Provider-agnostic embeddings (OpenAI, Google, Ollama; Anthropic falls back to pure BM25)
- File locking for concurrent operations, YAML frontmatter on all pages
- Obsidian export (zip with wikilinks), global search, status indicators
- Error boundaries on all routes, mobile-responsive nav

**Test coverage:** 6,757 lines of tests covering config, embeddings, export, ingest, lint, lint-fix, LLM, query, wiki, and smoke tests.

## Recent Changes (last 3 sessions)
1. **2026-04-11 20:24** — Content-Type validation on URL fetch, lightweight wiki list endpoint for GlobalSearch, file locking on vector store
2. **2026-04-11 16:29** — Streaming retry resilience (`callLLMStream` pre-stream retry), backlinks UI on wiki page views, SCHEMA.md housekeeping
3. **2026-04-11 12:40** — LLM-powered contradiction auto-fix (completing all 5 lint auto-fixes), file-level write locking, exponential backoff on LLM retries

The last several sessions have been **hardening and polish** — no new features, mostly resilience, consistency, and closing gaps. The journal notes "maybe improve graph view with clustering, or tackle query re-ranking quality" as the next frontier.

## Source Architecture

```
src/                        16,674 lines total
├── app/                     4,055 lines (pages + API routes)
│   ├── api/
│   │   ├── ingest/          148 lines (single + batch routes)
│   │   ├── lint/             68 lines (lint + fix routes)
│   │   ├── query/           155 lines (query + stream + save routes)
│   │   ├── raw/              34 lines
│   │   ├── settings/        133 lines (config + rebuild-embeddings)
│   │   ├── status/           13 lines
│   │   └── wiki/            388 lines (CRUD + graph + export)
│   ├── ingest/page.tsx      513 lines
│   ├── lint/page.tsx        317 lines
│   ├── query/page.tsx       329 lines
│   ├── settings/page.tsx    616 lines
│   ├── wiki/                866 lines (index, detail, edit, new, graph, log)
│   ├── raw/                 174 lines
│   └── page.tsx              95 lines (home)
├── components/            1,355 lines
│   ├── BatchIngestForm      316 lines
│   ├── GlobalSearch         274 lines
│   ├── WikiIndexClient      249 lines
│   ├── NavHeader            215 lines
│   ├── WikiEditor            96 lines
│   ├── StatusBadge           91 lines
│   ├── MarkdownRenderer      59 lines
│   └── DeletePageButton      55 lines
└── lib/                   11,264 lines (4,507 source + 6,757 tests)
    ├── ingest.ts            661 lines (URL fetch, content chunking, LLM ingest)
    ├── query.ts             536 lines (BM25, RRF, vector search, context building)
    ├── wiki.ts              461 lines (filesystem ops, index, log, cross-refs)
    ├── embeddings.ts        447 lines (vector store, embed, search)
    ├── lint.ts              408 lines (5 lint checks)
    ├── config.ts            353 lines (settings persistence)
    ├── lifecycle.ts         327 lines (write/delete side-effect orchestration)
    ├── llm.ts               314 lines (provider dispatch, retry, streaming)
    ├── lint-fix.ts          307 lines (auto-fix for all 5 lint issues)
    ├── frontmatter.ts       267 lines (YAML parse/serialize)
    ├── raw.ts               125 lines (raw source CRUD)
    └── (types, constants, citations, export, lock, providers)
```

## Open Issues Summary
No open issues on GitHub at this time. The project is entirely vision-driven.

## Gaps & Opportunities

### High-impact gaps (vision alignment):
1. **No full-text content search** — GlobalSearch only matches page titles. The founding vision's index.md-first approach works, but users expect a search bar to search content.
2. **No page version history / undo** — Edits and lint auto-fixes (especially contradiction resolution) are destructive with no way to revert. The founding vision notes "the wiki is just a git repo" but the web app doesn't expose any history.
3. **No PDF or file upload ingestion** — Only URLs and pasted text. The vision mentions "articles, papers, images, data files" as raw sources. PDFs are the #1 format for research papers.
4. **No query/conversation history** — Queries are ephemeral. The vision emphasizes "explorations compound in the knowledge base" but only saved answers persist — the questions themselves and unsaved answers vanish.
5. **Graph view limitations** — No zoom/pan, no touch support, no accessibility. The 440-line custom canvas implementation will struggle past ~200 nodes. The vision references Obsidian's graph view as the gold standard.

### Medium-impact improvements:
6. **Duplicate `slugify()` implementations** — Client-side (wiki/new) and server-side (ingest.ts) diverge; hyphens handled differently.
7. **Embedding provider detection duplicated** — `getEmbeddingModelName()` and `getEmbeddingModel()` in embeddings.ts repeat the same env→config cascade.
8. **BM25 corpus rebuilt on every query** — No caching; reads all wiki pages from disk each time. Fine for now, scaling wall at ~500+ pages.
9. **WikiEditor is a bare textarea** — No markdown preview, syntax highlighting, toolbar, or unsaved-changes warning.
10. **No tag management UI** — Tags exist in frontmatter but can only be added through LLM-generated content, not by users.
11. **No dark mode toggle** — Only `prefers-color-scheme`; no manual override.
12. **No loading skeletons** — Plain "Loading…" text throughout.

### Lower priority:
13. No authentication (fine for local-first, risky if deployed)
14. API keys stored in plaintext JSON
15. No rate limiting or cost visibility for LLM calls
16. No scheduled lint (manual-only)
17. No import from Obsidian/Notion/bookmarks
18. Lint auto-fix for contradictions and empty-page deletion have no confirmation/preview

## Bugs / Friction Found
- **No outright bugs** — build is green, all 457 tests pass, no TODO/FIXME comments remain.
- **Slug mismatch risk**: `slugify()` in `src/app/wiki/new/page.tsx` collapses consecutive hyphens (`/-{2,}/g, "-"`), but `slugify()` in `src/lib/ingest.ts` does not. A title like "hello--world" would get different slugs depending on which path creates the page.
- **Graph canvas inaccessible**: No `aria-label`, no fallback text, no touch events. The `<canvas>` element is invisible to screen readers and unusable on touch devices.
- **GlobalSearch caches page list once** per mount — pages added during the session don't appear until the user navigates away and back.
- **Mobile nav dropdown** renders outside the `<nav>` landmark in the DOM, breaking assistive tech navigation.
- **Contradiction auto-fix is destructive**: Rewrites a wiki page with no preview and no way to undo. The ingest preview pattern exists but hasn't been applied to lint fixes.
