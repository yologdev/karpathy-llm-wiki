# Assessment — 2026-04-12

## Build Status

**All green.** `pnpm build` ✅, `pnpm lint` ✅, `pnpm test` ✅ (543 tests across 12 test files, 3.94s). Build emits expected ENOENT warnings for missing `wiki/index.md` and `wiki/log.md` during static page generation (these are runtime-created files, not a real error).

## Project State

All four founding vision pillars are fully implemented end-to-end:

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking for long docs, human-in-the-loop preview, SSRF protection, raw source persistence |
| **Query** | ✅ | BM25 + optional vector search (RRF fusion), streaming responses, cited answers, save-answer-to-wiki loop, query history |
| **Lint** | ✅ | 7 check types (orphan, stale-index, empty, missing-cross-ref, contradiction, missing-concept-page, broken-link), LLM-powered auto-fix for all |
| **Browse** | ✅ | Wiki index with search/filter/tags, page view with backlinks, edit/delete/create, interactive D3 graph, log viewer, raw source browser, global full-text search, Obsidian export |

Supporting infrastructure: multi-provider LLM (Anthropic, OpenAI, Google, Ollama via Vercel AI SDK), settings UI with config persistence, file locking, YAML frontmatter, error boundaries on all routes, mobile-responsive nav.

## Recent Changes (last 3 sessions)

From journal.md (most recent first):

1. **2026-04-12 12:44** — Bare catch blocks replaced with typed `catch (err: unknown)`, fixed `findBacklinks` regex injection bug (slug metacharacters), fixed `fromCharCode` misuse in ingest HTML entity decoding, deduplicated link-detection regex in lint.ts. Janitorial/type-safety session.

2. **2026-04-12 08:41** — Per-operation page cache (`withPageCache` in wiki.ts), SSRF protection (private IP blocking, localhost, metadata endpoints), broken-link lint check with auto-fix stub page creation.

3. **2026-04-12 08:21** — Parallelized LLM lint checks, extracted shared JSON response parser, fixed TOCTOU race in lifecycle.ts, hardened graph error handling, added empty-query guard.

Git history shows a single squashed commit (`ced760d yoyo: growth session wrap-up`) — the repo appears to be using squash-on-push, so individual session commits aren't visible in the log.

## Source Architecture

**Total: ~18,900 lines across 79 TypeScript/TSX files.**

### Core library (`src/lib/`) — 4,960 lines
| File | Lines | Purpose |
|------|------:|---------|
| `ingest.ts` | 771 | URL fetch, HTML cleanup, LLM page generation, chunking |
| `wiki.ts` | 662 | Filesystem ops, index, log, search, page cache |
| `lint.ts` | 582 | 7 lint checks (orphan, stale, empty, cross-ref, contradiction, concept, broken-link) |
| `query.ts` | 545 | BM25 ranking, context building, LLM answering |
| `lint-fix.ts` | 452 | Auto-fix for all lint issue types |
| `embeddings.ts` | 449 | Vector store, embedding providers, cosine similarity |
| `config.ts` | 355 | Settings persistence, provider resolution |
| `lifecycle.ts` | 333 | Write/delete pipeline (index, log, embeddings, cross-refs) |
| `llm.ts` | 314 | Multi-provider LLM calls, retry with backoff |
| `frontmatter.ts` | 267 | YAML frontmatter parse/serialize |
| Others | 490 | query-history, raw, lock, providers, slugify, citations, constants, types, export |

### Tests (`src/lib/__tests__/`) — 7,820 lines
12 test files, 543 tests. Heaviest: `wiki.test.ts` (1,782), `ingest.test.ts` (1,401), `query.test.ts` (1,009), `embeddings.test.ts` (993), `lint.test.ts` (956).

### Pages (`src/app/`) — 4,640 lines
17 route files, 13 page components. Largest pages: `settings/page.tsx` (616), `ingest/page.tsx` (513), `query/page.tsx` (505), `wiki/graph/page.tsx` (445), `lint/page.tsx` (348).

### API routes (`src/app/api/`) — 16 route handlers, ~940 lines total.

### Components (`src/components/`) — 1,465 lines
9 components: GlobalSearch (339), BatchIngestForm (316), WikiIndexClient (249), NavHeader (215), WikiEditor (96), StatusBadge (91), MarkdownRenderer (59), DeletePageButton (55), ErrorBoundary (45).

## Open Issues Summary

No open issues on GitHub (`gh issue list` returns `[]`).

## Gaps & Opportunities

### vs. Founding Vision (`llm-wiki.md`)

1. **Image/asset handling** — Vision mentions downloading images locally and having the LLM view them. Currently not implemented; images in ingested HTML are dropped.
2. **Marp slide deck generation** — Vision mentions generating slide decks from wiki content. Not implemented.
3. **Dataview-style queries** — Vision mentions Obsidian Dataview for dynamic tables from frontmatter. Not implemented (though frontmatter exists).
4. **CLI tool** — Vision suggests CLI access alongside the web UI. Currently web-only.
5. **Obsidian plugin** — Export exists but no real Obsidian integration (plugin, MCP server, etc.).

### vs. YOYO.md Direction

6. **Multi-user / auth** — Listed as an open question. Not started.
7. **Vector search for Anthropic-only users** — Anthropic has no embedding API; the default/most-common provider gets zero vector search. Need a solution (local embeddings, or a lightweight embedding model).

### Performance & Scale

8. **`listWikiPages()` reads every page from disk** — Called on home page, every query, every lifecycle op. No caching between requests. Will degrade with 100+ pages.
9. **Lint reads all pages 3× in parallel checks** — Each check independently reads the full page set. Should read once and share.
10. **`buildCorpusStats()` in query re-reads everything per query** — Same pattern as above.

### UX

11. **No guided first-ingest walkthrough** — Empty-state onboarding exists but no step-by-step guide.
12. **Graph view accessibility** — No keyboard navigation, no screen reader support.
13. **Dark mode inconsistencies** — Some components use hardcoded colors that don't respect theme.

## Bugs / Friction Found

### Security (High)
- **SSRF DNS rebinding bypass** — `validateUrlSafety()` checks hostname strings but not resolved IPs. A hostname resolving to `127.0.0.1` after validation bypasses all checks.
- **SSRF redirect bypass** — `fetch()` follows redirects by default. A public URL can redirect to `http://169.254.169.254/` (cloud metadata). Should use `redirect: "manual"` or validate each hop.
- **IPv4-mapped IPv6 bypass** — `isPrivateIPv6` doesn't handle `::ffff:127.0.0.1`, a common SSRF vector.

### Correctness (Medium)
- **Delete backlink stripping has no file lock** — `stripBacklinksTo` in lifecycle.ts runs without a lock. Two concurrent deletes can read stale page content and clobber each other's removals.
- **`isRetryableError` regex too broad** — `message.match(/\b(4\d{2}|5\d{2})\b/)` matches any 3-digit number 400–599 in error text (e.g., "limit of 500 tokens" → retried). Should prioritize `.status` property.
- **`callLLMStream` doesn't pass `maxRetries`** — Streaming queries have zero fault tolerance for transient errors. The Vercel AI SDK's internal retry isn't activated.
- **Page cache is a module-level global singleton** — Unsafe with concurrent requests; one request's cache can serve stale data to another.
- **`response.text()` reads full body before size check** — Content-Length header check happens before fetch, but actual body size check happens after `response.text()` loads everything into memory. Spoofed or missing Content-Length bypasses the early check.

### Code Quality (Low)
- **`escapeRegex` duplicated** — Defined in both `lifecycle.ts` and `wiki.ts` (as `escapeRegExp`).
- **`extractWikiLinks` pattern duplicated 3×** — `lint.ts`, `lifecycle.ts`, and `wiki.ts` each independently parse `[text](slug.md)` links.
- **`listWikiPages` enriches every entry with frontmatter reads** — Even callers that only need slugs pay the full I/O cost.
- **`buildContext` loads pages sequentially** — Could use `Promise.all` for parallel reads.
- **Status report is slightly stale** — Reports 503 tests (actual: 543), mentions some fixed items as still pending (TOCTOU race, silent error swallowing, page cache).
