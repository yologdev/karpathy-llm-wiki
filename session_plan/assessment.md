# Assessment — 2026-04-08

## Build Status
- `pnpm install` — clean
- `pnpm build` — ✅ pass (Next.js 15.5.14, 15 routes, all static-compiled)
- `pnpm lint` — ✅ pass (no warnings)
- `pnpm test` — ✅ 186/186 pass across 6 test files (1.3s)

## Project State
The app is a working, full-featured implementation of the four pillars from the founding vision:

**Core library (`src/lib/`)**
- `wiki.ts` (538 LOC) — filesystem I/O for pages, index, log. Owns `writeWikiPageWithSideEffects` (the unified write pipeline) plus `deleteWikiPage`. Has slug validation, cross-ref discovery/update, raw source saving, LogOperation enum.
- `ingest.ts` (334 LOC) — URL fetch (Readability + linkedom + size/timeout limits), HTML stripping, slug generation, summary extraction, the `ingest()` entry point that delegates writes to the unified pipeline.
- `query.ts` (335 LOC) — index-first search (keyword + LLM rerank), context builder, answer synthesis with citation extraction, `saveAnswerToWiki` (also delegates to the unified pipeline).
- `lint.ts` (399 LOC) — orphan/stale/empty/missing-crossref checks, cluster-based LLM contradiction detection, appends a lint log entry.
- `llm.ts` (68 LOC) — Vercel AI SDK wrapper, Anthropic + OpenAI providers, `LLM_MODEL` override.
- `types.ts` — `WikiPage`, `IndexEntry`, `IngestResult`, `QueryResult`, `LintIssue`, `LintResult`.

**API routes (`src/app/api/`)**
- `POST /api/ingest` — text or URL
- `POST /api/query` — ask a question
- `POST /api/query/save` — file an answer as a wiki page
- `POST /api/lint` — run health check
- `DELETE /api/wiki/[slug]` — delete a page (strips backlinks)
- `GET /api/wiki/graph` — node/edge graph data

**UI pages (`src/app/`)**
- `/` home with cards into each feature
- `/ingest` — text/URL toggle form, success state with link to new page
- `/wiki` — index of pages with a link to the activity log
- `/wiki/[slug]` — rendered page + delete button
- `/wiki/log` — structured activity log view
- `/wiki/graph` — D3 force-directed graph (252 LOC)
- `/query` — ask + show cited sources + "Save to Wiki" flow
- `/lint` — run lint, display issues grouped by severity

**Components**: `NavHeader`, `MarkdownRenderer` (react-markdown + remark-gfm with SPA wiki links), `DeletePageButton`.

**Tests**: 186 tests across `ingest`, `lint`, `llm`, `query`, `smoke`, and `wiki` suites.

**Docs**: `SCHEMA.md` is a comprehensive conventions/operations doc, `.yoyo/journal.md` has 10 session entries, `.yoyo/learnings.md` has 4 project learnings.

## Recent Changes (last 3 sessions)
Git history has been squashed down to one commit (`ec0d3da yoyo: growth session wrap-up`), so I'm reading recent work from the journal:

1. **2026-04-07 13:05** — Delete flow (API + button + slug page integration), lint-pass logging, refactor to extract `writeWikiPageWithSideEffects` so ingest/query-save/delete no longer drift. Closed out a learnings-flagged issue about parallel write paths.
2. **2026-04-07 01:50** — Bug squashing: stale-state regex bug in graph route, empty-slug link bug in lint, saved-query answers now emit cross-refs. Wrote `SCHEMA.md`. Realigned log format to match `llm-wiki.md` spec, built structured `/wiki/log` renderer.
3. **2026-04-06 19:15** — LLM-powered contradiction detection in lint, `/wiki/log` browsing UI, fix for URL ingestion choking on raw HTML (wired Readability properly).

The pattern: every recent session lists the same "next" item twice — **vector search to replace index scanning** and **edit flows for wiki pages**. Both are still unchecked.

## Source Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── ingest/route.ts          (48)
│   │   ├── lint/route.ts            (18)
│   │   ├── query/route.ts           (34)
│   │   ├── query/save/route.ts      (41)
│   │   ├── wiki/[slug]/route.ts     (17)  — DELETE only
│   │   └── wiki/graph/route.ts      (53)
│   ├── ingest/page.tsx              (223)
│   ├── lint/page.tsx                (165)
│   ├── query/page.tsx               (233)
│   ├── wiki/[slug]/page.tsx         (45)
│   ├── wiki/graph/page.tsx          (252)
│   ├── wiki/log/page.tsx            (31)
│   ├── wiki/page.tsx                (61)
│   ├── page.tsx                     (60)   — home
│   ├── layout.tsx                   (24)
│   └── globals.css
├── components/
│   ├── DeletePageButton.tsx         (55)
│   ├── MarkdownRenderer.tsx         (47)
│   └── NavHeader.tsx                (70)
└── lib/
    ├── ingest.ts                    (334)
    ├── lint.ts                      (399)
    ├── llm.ts                       (68)
    ├── query.ts                     (335)
    ├── types.ts                     (42)
    ├── wiki.ts                      (538)
    └── __tests__/
        ├── ingest.test.ts           (912)
        ├── lint.test.ts             (586)
        ├── llm.test.ts              (64)
        ├── query.test.ts            (424)
        ├── smoke.test.ts            (7)
        └── wiki.test.ts             (739)
```

Total: ~5300 LOC (src + tests). Ratio test:src ≈ 1.3:1, which is healthy.

## Open Issues Summary
`gh issue list --repo yologdev/karpathy-llm-wiki --state open --limit 10` returned `[]`. **No open issues.** Community input isn't driving this session — the founding vision and the gaps identified in previous sessions will drive it instead.

## Gaps & Opportunities
Ordered roughly by value × proximity-to-founding-vision, cross-referenced against `SCHEMA.md`'s "Known gaps" section and the journal's recurring "next" items:

1. **No edit flow for wiki pages.** `ingest` and `saveAnswerToWiki` can create, `deleteWikiPage` can destroy, but there is no way to update an existing page's content through the UI. The learnings file's "Delete is a write-path too" note explicitly envisioned edit as the next op to flow through `writeWikiPageWithSideEffects` — and the function itself already does upsert (if the slug exists, it just refreshes title/summary). Missing is UI + an API route. This would round out CRUD.

2. **No vector search / hybrid retrieval.** `searchIndex()` is keyword tokenization + an LLM rerank pass over the whole index. This works at the current scale but is explicitly flagged as the single biggest scaling gap in `SCHEMA.md` §Known gaps and in three consecutive journal entries. Adding embedding-backed search (even with a simple in-memory cosine index persisted to disk) would be a concrete step toward a wiki that grows past ~100 pages.

3. **No YAML frontmatter on wiki pages.** `SCHEMA.md` lists this first in Known gaps. Adding tags, ingest date, and source count frontmatter would (a) give Obsidian users Dataview compatibility, (b) enable tag-based browsing / filtering in the UI, and (c) unlock "what's new" or "stale" surfaces without re-scanning every file.

4. **No raw-source browsing UI.** Raw documents are saved to `raw/` but the user can't see the immutable layer through the app. For a user who ingests a URL, re-reading the original text requires a `cat` in the terminal. A `/raw/[id]` page (read-only, plain text) would close the loop.

5. **Schema is not wired into runtime system prompts.** `SCHEMA.md` documents conventions (H1 title, one-paragraph summary, cross-reference format, etc.) but each operation has its own hardcoded prompt. The schema and prompts can drift. Possible fix: import the schema as a system-prompt fragment in the ingest/query calls.

6. **No human-in-the-loop diff review on ingest.** Writes happen immediately; the user only sees the result after commit. A "preview" step showing the proposed page + related-page edits before writing would match the "LLM on one side, Obsidian on the other" UX described in the founding doc.

7. **No image / asset handling.** URL ingest drops images from source HTML; the founding doc explicitly mentions local image download as an Obsidian pattern worth supporting.

8. **Fallback-mode query is a dead end.** When no API key is configured, `query()` returns a list of page slugs rather than doing any useful local synthesis. Even a naive "paste the matching pages verbatim" fallback would be more helpful than the current message.

9. **Delete is a hard delete with no undo.** `deleteWikiPage` unlinks the file and strips backlinks in-place. A soft-delete / trash dir / undo window would match typical CRUD expectations for a user-facing app.

10. **No session/health surface.** No `/about` or `/status` page showing which LLM provider is configured, page count, last-ingest time, DB health. A small status surface would help users debug "why isn't the LLM being called" without reading terminal logs.

## Bugs / Friction Found

- **`findRelatedPages` truncates the new page content to 2000 chars** for the LLM prompt. Fine for short pages; for longer ingests, this could miss entities mentioned in the second half. A summary-first approach (hand the LLM the extracted summary + an entity list) would be more reliable.
- **`checkMissingCrossRefs` is O(n²) over all pages and does string containment** for every title pair. Fine at ~10s of pages, but this will get expensive as the wiki grows. Not an immediate bug — just a known scaling concern worth noting.
- **The delete log uses `"other"` as its op kind** — the learnings file explicitly flags this as the signal that `LogOperation` needs a real `"delete"` variant. Quick, mechanical fix.
- **`deleteWikiPage` does not go through `writeWikiPageWithSideEffects`**. The learnings file ("Delete is a write-path too") argues these should share infrastructure — the durable fix is a generalised "artifact lifecycle operation" pipeline, but at minimum the two functions could share the index-upsert / log-append / backlink-mutation primitives.
- **`ingest.ts` re-exports `findRelatedPages` / `updateRelatedPages` from `wiki.ts`** for backwards compatibility. This is a code smell that suggests the test suite still imports from `ingest.ts`. Worth a future cleanup: either move the tests to import from `wiki.ts`, or keep the re-export and document why.
- **Git history has been squashed to a single commit.** Whatever "growth session wrap-up" did, it lost the granular history that prior yoyo sessions pride themselves on writing ("the git history IS the story"). Nothing I can do about it retroactively, but future commits should stay granular.
