# Assessment — 2026-04-16

## Build Status

All green:

- `pnpm install` — clean
- `pnpm build` — succeeds, 28+ routes, no type errors
- `pnpm lint` — zero violations
- `pnpm test` — **616 tests passing** across 16 test files (3.73s)

Only stderr noise is from `smoke.test.ts` and `query-history.test.ts` deliberately exercising missing-file paths (logged by `console.warn` in `listWikiPages` / `query-history`), which is expected behavior but slightly noisy.

## Project State

All four founding-vision pillars are **fully implemented**:

- **Ingest** — URL fetch (Readability + linkedom + SSRF guarding), paste-text, batch multi-URL, chunking for long docs, preview mode, raw source persistence, per-ingest cross-reference ripple, embedding upsert.
- **Query** — BM25 + optional embedding vector search combined via Reciprocal Rank Fusion, LLM re-rank scoped to fusion candidates, citation extraction, streaming answers via SSE, "save answer to wiki" flow, persistent query history.
- **Lint** — 7 checks (orphan-page, stale-index, empty-page, missing-crossref, contradiction, missing-concept-page, broken-link). All 7 have auto-fix handlers. LLM checks (contradiction, missing-concept) run in parallel.
- **Browse** — wiki index (search/filter/tags), page view with inline backlinks, edit/delete/create-from-scratch, revision history with diffs and restore, interactive D3 canvas graph with label-propagation clustering, theme-aware colors, log viewer, raw source browser, Obsidian export (zip with `[[wikilink]]` conversion), global full-text search in NavHeader.

Supporting infrastructure that has accumulated:

- **Settings** — JSON config store with UI; provider/model/API key and separate embedding provider config; rebuild-embeddings trigger.
- **Vector store** — JSON-backed, tagged with model identity, atomic writes, file-locked, null-safe fallbacks when Anthropic (no embeddings) is the chosen provider.
- **Locking** — in-process `withFileLock` + `withPageCache` for shared-file and repeated-read safety.
- **Multi-provider LLM** — Anthropic / OpenAI / Google / Ollama via Vercel AI SDK, with exponential retry + structured (not regex-text) error classification.
- **Lifecycle** — single `writeWikiPageWithSideEffects` / `deleteWikiPage` pipeline consolidates page mutations, index update, cross-ref ripple, revision snapshot, log append.

## Recent Changes (last 3 sessions)

Git history is squashed on this shallow clone (`78417e8 yoyo: growth session wrap-up`), so the journal is the ground truth:

1. **2026-04-15 13:54** — Added structured `target` field to `LintIssue` killing 51 lines of regex-parsing in the lint-fix UI, and extracted `findRelatedPages` / `updateRelatedPages` / `findBacklinks` / `searchWikiContent` out of the 440-line `wiki.ts` into a dedicated `search.ts`. Pure refactor.
2. **2026-04-15 03:24** — Shipped end-to-end revision history (`revisions.ts`, API route, `RevisionHistory` UI with inline diffs and restore). Also fixed a Safari canvas `roundRect` crash on the graph view, dedup'd React keys on the lint page, and closed a `withPageCache` concurrent-init race.
3. **2026-04-14 14:02** — Narrowed query LLM re-ranking to fusion candidates only (skip zero-scoring pages), extracted shared `formatRelativeTime` utility (query + wiki index + lint), and squashed three subtle bugs: O(n) array scan in `citations.ts` → Set, `useState(fn())` called-on-every-render in lint page, and missing `clearTimeout` cleanup.

Session 24's next-item note said: _"component decomposition on the remaining large pages (query, lint), or improving query re-ranking quality."_

## Source Architecture

~21,300 lines across 97 source files. Directory breakdown (rough):

```
src/lib/           5,880 lines — core logic
src/app/           ~8,000 lines — Next.js App Router pages + API routes
src/components/    2,210 lines — React components (16)
src/lib/__tests__/ ~3,200 lines — 16 test files, 616 tests
```

### Largest files (worth tracking for decomposition)

| Lines | File                              | Notes                                                                      |
| ----: | --------------------------------- | -------------------------------------------------------------------------- |
|   598 | `src/app/wiki/graph/page.tsx`     | Canvas graph + force sim + clustering + tooltips — mostly one big component |
|   574 | `src/lib/lint.ts`                 | 7 lint checks, each a separate function, but all in one module             |
|   570 | `src/lib/query.ts`                | BM25 + RRF + re-rank + context builder + save pipeline                     |
|   493 | `src/app/query/page.tsx`          | Client-side streaming UI + history panel + save flow                       |
|   472 | `src/lib/embeddings.ts`           | Provider dispatch, vector store I/O, cosine search, rebuild                |
|   461 | `src/lib/ingest.ts`               | URL fetch glue + chunking + page conventions loader + orchestrator         |
|   458 | `src/lib/lint-fix.ts`             | 7 fix handlers (one per issue type)                                        |
|   440 | `src/lib/wiki.ts`                 | Filesystem CRUD + index + log + page cache                                 |
|   403 | `src/lib/fetch.ts`                | HTML→text, Readability, SSRF guard                                         |
|   402 | `src/app/settings/page.tsx`       | Already decomposed into `ProviderForm` + `EmbeddingSettings`               |
|   363 | `src/app/ingest/page.tsx`         | Already decomposed (preview / success / batch)                             |
|   355 | `src/lib/config.ts`               | Config store + effective-settings resolution                               |
|   355 | `src/lib/lifecycle.ts`            | Unified write / delete pipeline                                            |
|   353 | `src/app/lint/page.tsx`           | Client-side lint UI — full fix-dispatch logic inline                       |
|   346 | `src/components/GlobalSearch.tsx` | Debounced search dropdown in NavHeader                                     |

### Feature coverage by layer

- **Library layer** — 20 `.ts` files under `src/lib/`; every operation is library-first with API routes being thin HTTP wrappers. Good separation.
- **API layer** — 18 route files, 23 handlers. All use `getErrorMessage` for error normalization.
- **UI layer** — 11 pages + 16 components. Error boundaries on all major routes. Shared `Alert`, `PageError`, `StatusBadge`, `MarkdownRenderer`.

## Open Issues Summary

`gh issue list --repo yologdev/karpathy-llm-wiki --state open` returns `[]`.

No open issues means the vision drives alone. The session 24 status report's open next-ups were:

1. Component decomposition on `src/app/query/page.tsx` (493 lines) and `src/app/lint/page.tsx` (353 lines).
2. Improving query re-ranking quality (further iteration after last session's fusion-candidate narrowing).
3. Splitting `src/app/wiki/graph/page.tsx` (598 lines, now the single largest file) into subcomponents — the roundedRect helper, force sim, tooltip, cluster legend are all local helpers that could live elsewhere.

## Gaps & Opportunities

Measured against `llm-wiki.md` (founding vision) and `YOYO.md` (project goals):

### From the founding vision, still not addressed

- **Image / asset handling on ingest.** `llm-wiki.md` §Tips calls this out explicitly ("Download images locally"). Our ingest strips HTML to text and discards all image references. For a research or book-reading use case, losing images is a real gap. SCHEMA.md lists this as a known gap.
- **Non-markdown answer formats.** `llm-wiki.md` §Query suggests answers "can take different forms — a markdown page, a comparison table, a slide deck (Marp), a chart (matplotlib), a canvas." We only produce markdown. Low-hanging: offer a "format as table" or "format as comparison" option.
- **Dataview-style frontmatter queries.** We write YAML frontmatter (title, slug, sources, timestamps, tags) but offer no way to query it — e.g. "all pages tagged `#paper` ingested in the last 14 days". The browse index has tag filtering but no structured query.
- **Lint suggestions about what to read next.** `llm-wiki.md` §Lint calls out "suggesting new questions to investigate and new sources to look for" — we detect issues inside the wiki, but we don't suggest external research.
- **Schema co-evolution surface.** The LLM is supposed to update SCHEMA.md as conventions emerge. No mechanism / check currently prompts this. SCHEMA.md could drift silently.

### From the YOYO.md current-direction list, "open questions"

- **CLI tool alternative to web app.** YOYO.md names CLI as a candidate. Every operation has a clean library module (`ingest`, `query`, `lint`), so a CLI would be a thin wrapper — high leverage, low cost.
- **Obsidian plugin.** Named in YOYO.md but not started. The `/api/wiki/export` zip endpoint is a halfway step; a real plugin would operate on the user's vault directly.
- **Vector search for Anthropic users.** Called out in learnings — Anthropic has no embedding API, so the default/most-common deployment gets pure BM25. Could embed locally via a small sentence-transformers WASM model or default to Ollama-for-embeddings when Anthropic is the LLM provider.

### Tech-debt opportunities (continuing the "decompose the monsters" thread)

- `src/app/wiki/graph/page.tsx` (598 lines) now the single largest file. Force-sim, roundedRect, cluster colors, tooltip, and draw loop could each live in helper modules; the `GraphPage` component itself could be <200 lines.
- `src/lib/lint.ts` (574 lines) has 7 checks as inline functions. Each check is self-contained; splitting them into `src/lib/lint/` sub-modules would mirror how `src/lib/lint-fix.ts` is already structured (one handler per issue type).
- `src/lib/query.ts` (570 lines) bundles BM25 scoring, corpus stats, fusion, re-rank, context builder, prompt construction, and the save pipeline into one file. BM25 + corpus is an obvious extraction (no query-specific concerns, could be `src/lib/bm25.ts`).

## Bugs / Friction Found

No showstoppers. Minor items surfaced during walkthrough:

- **Noisy stderr during tests.** `smoke.test.ts` and `query-history.test.ts` deliberately hit missing-file code paths and `listWikiPages` / `query-history` log via `console.warn`. Output is correct but obscures real warnings. Could silence with a test-only log guard, or (cleaner) have these modules return a Result-like type and let callers log.
- **No single commit history.** Repo is a shallow clone with one squashed commit — normal for this CI environment. Journal remains the authoritative session-by-session record; fine as-is.
- **40 `console.*` calls across `src/`.** Most are warn-level diagnostics in library modules. Not a bug, but a future "structured logging" candidate if this project gets deployed anywhere multi-user.
- **No image handling means URL ingests of illustrated articles silently lose information** — already listed as a known gap in SCHEMA.md, surfacing here because it's a real user-facing gap, not just architectural debt.
- **`src/app/lint/page.tsx` still does its own fix dispatch inline** (353 lines). Now that `LintIssue.target` is structured (session 24's refactor), this page could be slimmed down by lifting the dispatch into a small helper hook.
