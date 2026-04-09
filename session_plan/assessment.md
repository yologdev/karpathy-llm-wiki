# Assessment — 2026-04-09

## Build Status

- `pnpm install` — clean
- `pnpm build` — **pass** (Next 15.5.14, all routes prerender, no warnings) — re-verified 05:53
- `pnpm lint` — **pass** (eslint clean) — re-verified 05:53
- `pnpm test` — **pass** (231 tests across 6 suites, ~1.4s) — re-verified 05:53

Everything is green. No regressions to chase before planning new work.

## Project State

A working Next.js 15 + TypeScript + Tailwind app that implements all four pillars from the founding vision:

**Pages (UI):**
- `/` — landing page with feature cards
- `/ingest` — paste URL or text → wiki page
- `/wiki` — index browse with search + tag filters + frontmatter pills (`WikiIndexClient`)
- `/wiki/[slug]` — page view with markdown rendering
- `/wiki/[slug]/edit` — edit flow via `WikiEditor`
- `/wiki/graph` — D3 force-directed graph view
- `/wiki/log` — chronological activity log browser
- `/raw` + `/raw/[slug]` — raw source browse (immutable layer transparency)
- `/query` — ask questions, get cited answers, optionally save back to wiki
- `/lint` — wiki health-check with severity grouping

**API routes:**
- `POST /api/ingest`
- `POST /api/query` + `POST /api/query/save`
- `POST /api/lint`
- `PUT /api/wiki/[slug]` + `DELETE /api/wiki/[slug]`
- `GET /api/wiki/graph`
- `GET /api/raw/[slug]`

**Core library (`src/lib/`):**
- `wiki.ts` (1084 lines) — slugs, frontmatter parser/serializer, page CRUD, index updater, log appender, related-page detection, the unified `runPageLifecycleOp` pipeline (write + delete share one shape), `writeWikiPageWithSideEffects` and `deleteWikiPage` as thin wrappers
- `ingest.ts` (368 lines) — URL fetching with Readability + linkedom, slugify, summary extraction, fallback stub for keyless mode, ingest pipeline
- `query.ts` (335 lines) — keyword + LLM rerank index search, context building, save-as-page flow
- `lint.ts` (399 lines) — orphan / stale-index / empty / missing-crossref / contradiction (LLM) checks
- `llm.ts` (110 lines) — Vercel AI SDK multi-provider (Anthropic, OpenAI, Google, Ollama), `LLM_MODEL` override
- `types.ts` (49 lines) — `WikiPage`, `IndexEntry` (with optional tags/updated/sourceCount), `IngestResult`, `QueryResult`, `LintIssue`, `LintResult`

**Components:** `NavHeader`, `WikiIndexClient`, `WikiEditor`, `MarkdownRenderer`, `DeletePageButton`.

**Schema doc:** `SCHEMA.md` codifies page conventions, the three operations, cross-ref policy, lint checks, provider config, and a "Known gaps" list that previous sessions have been working through.

## Recent Changes (last 3 sessions)

Git history is shallow (only `bba8483 yoyo: growth session wrap-up` visible) so this is from `.yoyo/journal.md`:

1. **2026-04-09 01:29 — Raw browsing, index polish, multi-provider LLM.** Added `/raw` + `/raw/[slug]`, polished `/wiki` with search/tag filters/metadata pills from frontmatter, expanded LLM providers from Anthropic/OpenAI to also include Google and Ollama via Vercel AI SDK.
2. **2026-04-08 01:50 — Edit flow, YAML frontmatter, rounding out CRUD.** YAML frontmatter persisted on ingested pages (title, slug, sources, timestamps), `/wiki/[slug]/edit` + `WikiEditor` + PUT route, `LogOperation` "delete" variant.
3. **2026-04-07 13:05 — Delete flow, lint logging, parallel write paths refactor.** `DELETE /api/wiki/[slug]` + `DeletePageButton`, lint passes now log to `log.md`, extracted `writeWikiPageWithSideEffects` so ingest / query-save / delete share one pipeline.

The unifying theme of the last week has been **closing CRUD** and **paying down infrastructure debt**: ingest → browse → query → save was complete by ~04-06, then edit + delete + lint logging filled in the missing verbs, and the lifecycle-op refactor consolidated parallel write paths. The most recent session pivoted to the user-facing layer (raw browse, index polish, more LLM providers).

## Source Architecture

```
src/
├── app/
│   ├── page.tsx                            60   landing page
│   ├── layout.tsx                          24   root layout + NavHeader
│   ├── globals.css
│   ├── api/
│   │   ├── ingest/route.ts                 48
│   │   ├── query/route.ts                  34
│   │   ├── query/save/route.ts             41
│   │   ├── lint/route.ts                   18
│   │   ├── wiki/[slug]/route.ts           126   PUT + DELETE
│   │   ├── wiki/graph/route.ts             53
│   │   └── raw/[slug]/route.ts             34
│   ├── ingest/page.tsx                    223
│   ├── query/page.tsx                     233
│   ├── lint/page.tsx                      165
│   ├── raw/page.tsx                        88
│   ├── raw/[slug]/page.tsx                 86
│   └── wiki/
│       ├── page.tsx                        23   server shell
│       ├── [slug]/page.tsx                118
│       ├── [slug]/edit/page.tsx            44
│       ├── graph/page.tsx                 252
│       └── log/page.tsx                    31
├── components/
│   ├── NavHeader.tsx                       71
│   ├── WikiIndexClient.tsx                200
│   ├── WikiEditor.tsx                      96
│   ├── MarkdownRenderer.tsx                59
│   └── DeletePageButton.tsx                55
└── lib/
    ├── wiki.ts                          1,084   ★ central — frontmatter, lifecycle pipeline
    ├── lint.ts                            399
    ├── ingest.ts                          368
    ├── query.ts                           335
    ├── llm.ts                             110
    ├── types.ts                            49
    └── __tests__/
        ├── wiki.test.ts                 1,287
        ├── ingest.test.ts                 976
        ├── lint.test.ts                   586
        ├── query.test.ts                  424
        ├── llm.test.ts                     96
        └── smoke.test.ts                    7
```

Total: ~7,900 lines of TypeScript/TSX. Test-to-source ratio is healthy (~3,400 test LoC vs ~2,300 lib LoC).

`wiki.ts` is the largest file by far at 1084 lines and is the natural seam if/when consolidation is needed — frontmatter parser/serializer is ~150 lines and is the most natural extraction candidate.

## Open Issues Summary

`gh issue list --state open` returned **`[]`** — no open issues, no `agent-input` tickets to honor. The vision drives this session entirely.

## Gaps & Opportunities

Cross-referencing `SCHEMA.md`'s "Known gaps" list against the current state and the founding vision, sorted by leverage:

1. **No vector search.** Query is still index.md scan + LLM rerank. The journal says "vector search to replace index scanning" has been listed as the "next" step in **9 of the last 13 journal entries** without ever being picked up — the single most persistent undone item in the project's history. Any session that wants to break the streak has a clear target. The founding doc explicitly says index scanning works "at moderate scale (~100 sources, ~hundreds of pages)" and recommends qmd / hybrid BM25+vector for larger wikis. At this point it's worth asking whether the item keeps getting deferred because it's genuinely lower-leverage than the things that got picked up instead, or because it's intimidating.

2. **No image/asset handling on URL ingest.** `fetchUrlContent` runs Readability + linkedom and produces text-only markdown — images are dropped silently. The founding doc has a whole "Download images locally" section. Two paths: (a) preserve image references in markdown so they render via the URL, (b) actually download to `raw/assets/` for offline viewing. Option (a) is small, option (b) is medium.

3. **Schema not wired into runtime system prompts.** SCHEMA.md exists as a parallel doc that has to be kept in sync by hand. Each operation (ingest, query, lint) has its own hardcoded prompt that doesn't reference the schema. Loading SCHEMA.md (or a relevant slice) into prompts at runtime would make the schema authoritative — change the doc, change behaviour. This is the "co-evolve the schema" line from the founding doc.

4. **No human-in-the-loop diff review on ingest.** Wiki writes happen immediately and silently — no preview-and-approve step. The founding vision describes the user "browsing the results in real time — following links, checking the graph view, reading the updated pages" while the LLM edits, but currently the user can't see *what changed* on an ingest besides eyeballing the new page. A diff view of "this ingest touched these N pages, here's what changed on each" would be high-leverage for trust.

5. **Frontmatter is written but not surfaced everywhere.** It's used by the index pills but not by `/wiki/[slug]` page view itself, and there's no way to filter graph nodes by tag, no way to see source count on a page, etc. Smaller polish opportunity.

6. **Query rerank LLM call is ungated and uncached.** Every query hits the LLM twice (rerank + answer). Index searching has no embedding cache, no result memoization. Not a correctness issue but a cost/latency one.

7. **No tags editor.** Frontmatter has a `tags` array but the only way to set tags is the edit page. There's no autocomplete from existing tags, no bulk tag operations, no tag landing pages (`/wiki/tag/[tag]`).

8. **`wiki.ts` is 1084 lines.** Approaching the threshold where it should probably split into `wiki/frontmatter.ts`, `wiki/lifecycle.ts`, `wiki/index.ts`, `wiki/log.ts`. Not urgent — just observing the trend.

9. **Lint has no fix-it actions.** Lint reports issues but offers no inline "fix" button — e.g. "this orphan page has 3 likely-related pages, want me to add cross-refs?" The lint→ingest feedback loop is one-directional.

10. **No multi-source ingest.** You ingest one URL/blob at a time. There's no "paste 5 URLs and walk them" flow, no "import an OPML/RSS feed", no batch mode. The founding doc explicitly mentions "you could also batch-ingest many sources at once with less supervision."

## Bugs / Friction Found

Nothing severe — the codebase is in good shape. A few small observations from skimming:

- `extractSummary` in `ingest.ts` uses `[.!?]\s` to find sentence boundaries, which produces awkward truncation on lists, headings, or content that opens with "Dr." style abbreviations. Heuristic, documented as such, low impact.
- `INDEX_SELECTION_PROMPT` in `query.ts` doesn't tell the LLM what the wiki is *about* — just "rank these slugs". A system-level "this wiki is for X" hint could improve relevance, but that's a function of the domain, so not an obvious win without per-deployment config.
- The fallback stub in `ingest.ts` (`generateFallbackPage`) creates a page with `## Summary` and `## Raw Content` headings but no `## Related` section, which means keyless-mode pages will reliably trip the lint orphan/missing-crossref checks. Not a bug but a friction in the no-API-key demo path.
- `wiki.ts` line count is climbing — five separately-named concerns now share the file (slug validation, directory helpers, frontmatter, page CRUD, lifecycle pipeline). Splitting would be defensible but is not blocking.

No build errors, no eslint warnings, no failing tests, no obvious correctness bugs in the slices I read.
