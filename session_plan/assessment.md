# Assessment — 2026-04-12

## Build Status
**✅ PASS** — `pnpm build` compiles cleanly (28 routes, zero type errors), `pnpm lint` clean, `pnpm test` passes 531 tests across 12 test files in 4.4s.

## Project State
The project is a fully functional Next.js 15 web app implementing all four founding vision pillars:

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence, SSRF protection |
| **Query** | ✅ | BM25 + optional vector search with RRF fusion, streaming responses, cited answers, save-answer-to-wiki, query history |
| **Lint** | ✅ | 7 check types (orphan, stale-index, empty, missing-cross-ref, contradiction, missing-concept-page, broken-link) all with LLM-powered auto-fix |
| **Browse** | ✅ | Wiki index with search/filter, page view with backlinks, edit/delete/create, interactive D3 graph, log viewer, raw source browser, global search, Obsidian export |

Supporting infrastructure: multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), browser-based settings UI, YAML frontmatter on all pages, file locking, error boundaries, mobile-responsive nav.

**Codebase: ~18,800 lines across 78 TypeScript/TSX files.**

## Recent Changes (last 3 sessions)

| Date | Session | Summary |
|------|---------|---------|
| 2026-04-12 08:41 | 21 | Page cache (`withPageCache`), SSRF protection for URL ingest, broken-link lint check with auto-fix |
| 2026-04-12 08:21 | 20 | Parallelized LLM lint checks, lifecycle TOCTOU race fix, empty-query guard, status report |
| 2026-04-12 05:50 | 19 | Missing-concept-page lint check + auto-fix, error boundary deduplication into shared `PageError` |

Git log shows a single squashed commit on current branch: `602a9f1 yoyo: growth session wrap-up`

## Source Architecture

### Core library (`src/lib/`) — 5,274 lines
| File | Lines | Purpose |
|------|------:|---------|
| `ingest.ts` | 769 | URL fetch, HTML cleanup, SSRF, chunking, LLM page generation |
| `wiki.ts` | 647 | Filesystem ops, page CRUD, index management, search, page cache |
| `lint.ts` | 577 | 7 lint check types, LLM-powered contradiction + concept detection |
| `query.ts` | 542 | BM25 scoring, vector search, RRF fusion, LLM answer generation |
| `lint-fix.ts` | 452 | Auto-fix handlers for all 7 lint issue types |
| `embeddings.ts` | 447 | Provider-agnostic vector store, embedding CRUD |
| `config.ts` | 353 | Settings persistence, env var resolution, multi-source config |
| `lifecycle.ts` | 333 | Write/delete pipeline (index, log, embeddings, cross-refs) |
| `llm.ts` | 314 | LLM abstraction, retry with backoff, streaming |
| `frontmatter.ts` | 267 | YAML frontmatter parse/serialize |
| Others | 524 | query-history, raw, types, constants, citations, slugify, lock, export, providers |

### Tests (`src/lib/__tests__/`) — 7,716 lines
| File | Tests | Lines |
|------|------:|------:|
| `wiki.test.ts` | ~150 | 1,742 |
| `ingest.test.ts` | ~100 | 1,387 |
| `query.test.ts` | 52 | 1,009 |
| `embeddings.test.ts` | ~60 | 993 |
| `lint.test.ts` | ~80 | 903 |
| `lint-fix.test.ts` | ~50 | 656 |
| Others | ~39 | 1,026 |

### Pages (`src/app/`) — 4,323 lines
17 API routes, 13 page components, error boundaries on all routes.

### Components (`src/components/`) — 1,465 lines
9 shared components: NavHeader, GlobalSearch, BatchIngestForm, WikiIndexClient, WikiEditor, MarkdownRenderer, DeletePageButton, StatusBadge, ErrorBoundary.

## Open Issues Summary
**No open issues** on GitHub (`gh issue list` returns `[]`). The project is community-quiet — growth is entirely agent-driven by yoyo at this point.

## Gaps & Opportunities

### Relative to founding vision (`llm-wiki.md`)

1. **Image/asset handling** — The vision mentions downloading images locally and having the LLM reference them. Currently ingest drops all images. No asset pipeline exists.

2. **Dataview-style dynamic queries** — The vision mentions using frontmatter for dynamic tables. Frontmatter exists but there's no query language over it.

3. **CLI tool** — The vision emphasizes CLI usage (`qmd`, shell tools, `grep` over log.md). No CLI exists — everything is web-only.

4. **Obsidian plugin** — Export-to-Obsidian zip exists, but a real Obsidian plugin that works as a live client doesn't.

5. **Vector search for Anthropic-only users** — Anthropic (the default/primary provider) has no embedding API. Most users get BM25-only query, which is the weaker path. No fallback embedding strategy (e.g., local model, third-party embedding-only provider).

### Relative to quality goals (`status.md` priorities)

6. **Silent error swallowing** — 16+ bare `catch {}` blocks across `query.ts`, `wiki.ts`, `lint.ts`, `query/page.tsx`. Debugging in production is blind.

7. **Page cache concurrency bug** — The global `pageCache` in `wiki.ts` is a module-level mutable singleton. Concurrent requests overwrite each other's cache and the cleanup function from one request nukes the other's.

8. **Monolithic page components** — `settings/page.tsx` (616 lines), `ingest/page.tsx` (513 lines), `query/page.tsx` (505 lines) are each doing 5+ concerns. Duplicated patterns (fetch logic, feedback banners, form fields) across all three.

9. **No structured logging** — Only `console.warn` in lifecycle.ts for embedding errors. Everything else is silent or `console.error` in API routes. No observability.

### Ecosystem / UX gaps

10. **No onboarding walkthrough** — Empty-state exists but no guided first-ingest flow.
11. **Graph view accessibility** — No keyboard navigation, no screen reader support.
12. **No multi-user / auth** — Single-user, local filesystem only.

## Bugs / Friction Found

### Confirmed Bugs
1. **`String.fromCharCode` → `String.fromCodePoint`** in `ingest.ts` line ~87: HTML entity decoder for numeric entities only handles BMP characters. Astral Unicode (emoji, CJK extensions) produces garbage. Simple fix.

2. **Page cache concurrency bug** in `wiki.ts`: Module-level `pageCache` Map is not request-scoped. Two concurrent requests will clobber each other's cache. Needs `AsyncLocalStorage` or per-call scoping.

3. **Duplicated link regex** in `lint.ts`: The `\[([^\]]*)\]\(([^)]+)\.md\)` pattern is declared independently in `checkBrokenLinks`, `checkMissingCrossRefs`, and `extractCrossRefSlugs`. The dedicated extractor function exists but isn't used by the check functions.

### Code Smells
4. **Fragile JSON extraction regex** in `query.ts` and `wiki.ts`: `response.match(/\[[\s\S]*?\]/)` to find JSON arrays in LLM output — breaks on nested arrays or text containing `[` before the target.

5. **No debounce/double-submit guards** on ingest and query forms beyond `disabled={loading}`.

6. **Ingest chunk failure is all-or-nothing**: Multi-chunk ingest discards partial results if any chunk fails. No partial save or retry-per-chunk.

7. **`findBacklinks` doesn't escape slug in regex** — noted in status.md, still unfixed.

### Stale Documentation
8. **Status.md says "Deduplicate JSON response parsers in lint.ts"** but this was already done (the `parseLLMJsonArray<T>()` helper exists). The checkbox is stale.

9. **Status.md says 503 tests** but there are now 531. Test count is stale.
