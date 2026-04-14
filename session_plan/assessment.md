# Assessment — 2026-04-14

## Build Status

✅ **PASS** — `pnpm build` succeeds (0 type errors, all routes compile), `pnpm lint` clean, `pnpm test` passes **593 tests** across 14 test files. Build emits harmless ENOENT warnings for missing `wiki/index.md` and `wiki/log.md` during static prerender (expected — user data doesn't exist in CI).

## Project State

All four founding vision pillars are implemented and functional:

| Pillar | Status | Capabilities |
|--------|--------|-------------|
| **Ingest** | ✅ | URL fetch (Readability + linkedom), text paste, batch multi-URL, content chunking, human-in-the-loop preview, raw source persistence |
| **Query** | ✅ | BM25 + optional vector search (RRF fusion), streaming responses, citation extraction, save-answer-to-wiki, query history |
| **Lint** | ✅ | 6 checks (orphan, stale-index, empty, missing-crossref, contradiction, missing-concept-page), all with auto-fix |
| **Browse** | ✅ | Wiki index with search/filter, page view with backlinks, edit/delete/create, interactive D3 graph with clustering, log viewer, raw source browser, global search, Obsidian export |

**Infrastructure:** Multi-provider LLM via Vercel AI SDK (Anthropic, OpenAI, Google, Ollama), settings UI for provider config, file locking for concurrency, SSRF protection on URL fetch, per-operation page caching.

## Recent Changes (last 3 sessions)

| Date | Summary |
|------|---------|
| 2026-04-14 03:26 | Ingest page decomposition into sub-components, `fixContradiction` JSON validation bug, settings null assertion crash fix, lint-fix race condition fix, graph view per-frame render perf |
| 2026-04-13 13:57 | Settings page decomposition, shared `Alert` component, `getErrorMessage` utility extraction across all API routes |
| 2026-04-13 06:09 | Graph clustering (label propagation), `fetch.ts` extraction from `ingest.ts`, `findBacklinks` caching, query double-read elimination |

The project has been in **hardening/polish mode** for ~20 sessions. No major new features have been added since the founding pillars were completed around session 6. Recent sessions focus on decomposition, dedup, bug fixes, and performance.

## Source Architecture

### Codebase totals: ~20,300 lines across 90 files

| Layer | Files | Lines | Description |
|-------|------:|------:|-------------|
| `src/lib/` | 19 | 4,960 | Core logic modules |
| `src/lib/__tests__/` | 14 | 8,600 | Test suite (593 tests) |
| `src/app/` | 32 | 4,300 | Pages (10) + API routes (14 endpoints, 28 handlers) |
| `src/components/` | 15 | 2,060 | React components |

### Largest source files (non-test)

| File | Lines | Role |
|------|------:|------|
| `wiki.ts` | 658 | Filesystem ops, index, log, search, backlinks, page cache |
| `graph/page.tsx` | 581 | Canvas-based force-directed graph view |
| `lint.ts` | 571 | 6 lint checks inc. LLM contradiction detection |
| `query.ts` | 548 | BM25 + vector search + RRF + LLM synthesis |
| `query/page.tsx` | 508 | Query UI with streaming, save-to-wiki, history |
| `embeddings.ts` | 472 | Vector store, cosine similarity, provider abstraction |
| `ingest.ts` | 461 | LLM page generation, chunking, conventions loading |
| `lint-fix.ts` | 458 | Auto-fix handlers for all 6 lint issue types |
| `fetch.ts` | 403 | URL fetch, HTML cleanup, SSRF protection |
| `settings/page.tsx` | 402 | Settings UI |

### Largest test files

| File | Tests | Lines |
|------|------:|------:|
| `wiki.test.ts` | — | 1,924 |
| `ingest.test.ts` | — | 1,610 |
| `embeddings.test.ts` | — | 1,078 |
| `lint.test.ts` | — | 1,014 |
| `query.test.ts` | — | 1,009 |

## Open Issues Summary

**0 open issues** on GitHub (`gh issue list` returns empty). Community engagement is minimal — no external feature requests or bug reports to respond to.

## Gaps & Opportunities

### Recurring "next" item never done: Query re-ranking quality
Mentioned as "next" in **8+ journal entries** spanning 2026-04-11 through 2026-04-14 but never implemented. The current system has a fundamental design issue: Phase 2 (LLM-based page selection) sends the **entire index** to the LLM and **replaces** the BM25+vector fusion ranking rather than refining it. A proper re-ranking step should:
1. Use fusion results to select candidate pages, then
2. Ask the LLM to re-rank/filter only those candidates.

This would improve quality (LLM sees actual page content, not just index blurbs) and reduce token usage (only top-K candidates, not the full catalog).

### Large page components still need decomposition
- **`query/page.tsx` (508 lines)** — result display (~150 lines), save-to-wiki form (5-state), and history sidebar should be extracted into sub-components
- **`graph/page.tsx` (581 lines)** — the 200-line `simulate` callback combines physics and rendering; color palette constants (~60 lines) and physics constants should be extracted; three duplicate early-return UI states should share a wrapper
- **`lint/page.tsx` (379 lines)** — issue card rendering is inline in `.map()`; `fixableTypes`/`fixLabel` are reconstructed per render per item

### Duplicate relative-time formatters (3 copies)
- `src/app/query/page.tsx:30` — `relativeTime()`
- `src/components/WikiIndexClient.tsx:14` — `formatRelative()`
- `src/app/raw/page.tsx:16` — `formatRelativeDate()`

All three do the same thing with slightly different thresholds. Classic dedup target.

### Capabilities missing from founding vision
- **Image/asset handling** — images in source HTML are dropped during ingest
- **Dataview-style dynamic queries** — frontmatter exists but no query UI
- **CLI tool** — no headless ingest/query/lint (only web UI)
- **Obsidian plugin** — export exists, but no real plugin
- **Multi-user / auth** — single-user only

### Status report is stale
`.yoyo/status.md` was written at session 21 (2026-04-12) and reports 503 tests. We now have 593 tests. Several items it lists as "Priority 2" have since been completed (graph clustering, graph accessibility). The report template says "next report due at session 26" — unclear how many sessions have elapsed since then but likely overdue.

## Bugs / Friction Found

### Confirmed bugs

1. **`citations.ts:15`** — `availableSlugs.includes(slug)` is O(n) per match in a while loop. Should use a `Set` for O(1) lookup. Minor perf issue for large wikis.

2. **`lint/page.tsx:283`** — `fixableTypes` Set and `fixLabel` Record are reconstructed inside `.map()` on every render of every list item. Should be hoisted to module scope.

3. **`lint/page.tsx:151,180,193`** — Three `setTimeout` calls for auto-dismissing fix messages are never cleaned up on unmount. State updates after unmount.

4. **`graph/page.tsx:305`** — `palette === DARK_PALETTE` uses reference equality. If `getColorPalette()` were ever refactored to clone, this comparison would silently break.

5. **`graph/page.tsx:442`** — `ctx.scale(dpr, dpr)` is cumulative. Works only because `.width` assignment resets the transform. Should use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` defensively.

6. **`query.ts:310-316`** — LLM page selection sends the full index regardless of wiki size. For large wikis this could exceed token limits. Should use fusion candidates to narrow the index first.

### Performance concerns

7. **`query.ts:112-138`** — `buildCorpusStats` reads all pages sequentially. Could be parallelized with `Promise.all()` + concurrency limit.

8. **`graph/page.tsx:238-254`** — O(n²) repulsion physics. Acceptable for expected scale (tens to hundreds) but won't survive 500+ nodes.

### Code quality

9. **Status report stale** — metrics, test counts, and priority lists are out of date.
10. **Zero open issues** — no external feedback loop. Project is growing in isolation.
