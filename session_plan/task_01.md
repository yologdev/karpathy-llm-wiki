Title: Extract writeWikiPageWithSideEffects — apply the parallel-write-paths learning
Files: src/lib/wiki.ts, src/lib/ingest.ts, src/lib/query.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Why

This is the single highest-leverage refactor in the repo. `.yoyo/learnings.md` contains
an explicit learning ("Parallel write-paths drift — extract the shared pipeline") describing
a previous bug where `saveAnswerToWiki` silently diverged from `ingest()`. The durable fix
prescribed by the learning — "extract `writeWikiPageWithSideEffects` and have every write-path
go through it" — has NEVER been applied. Both `ingest()` (src/lib/ingest.ts lines ~395–432)
and `saveAnswerToWiki()` (src/lib/query.ts lines ~295–348) still manually run the same
5-step sequence:

1. writeWikiPage(slug, content)
2. listWikiPages + upsert index entry (with existing-entry handling)
3. updateIndex
4. re-listWikiPages → findRelatedPages → updateRelatedPages
5. appendToLog

Collapsing this makes future ops (edit, delete, re-ingest, import) nearly free.

## What to do

1. **Add `writeWikiPageWithSideEffects()` to `src/lib/wiki.ts`** — or to a new small module
   if you prefer, but `wiki.ts` is fine since it already owns filesystem + index + log.
   Signature:

   ```ts
   export interface WritePageOptions {
     slug: string;
     title: string;
     content: string;           // full markdown to write to the page file
     summary: string;           // index entry summary
     logOp: LogOperation;       // "ingest" | "save" | etc.
     logDetails?: (ctx: { updatedSlugs: string[] }) => string;
     // Content used for cross-ref discovery — defaults to `content` but ingest
     // passes the raw source text so findRelatedPages sees the full doc, not
     // the LLM-formatted page. Pass undefined to skip cross-ref entirely.
     crossRefSource?: string | null;
   }

   export interface WritePageResult {
     slug: string;
     updatedSlugs: string[];    // related pages that got backlinks
   }

   export async function writeWikiPageWithSideEffects(
     opts: WritePageOptions,
   ): Promise<WritePageResult>
   ```

   Implementation:
   - Validate slug (reuse `validateSlug`).
   - `await writeWikiPage(opts.slug, opts.content)`
   - Read index, upsert the `{ title, slug, summary }` entry (same logic both
     callers currently duplicate), `await updateIndex(entries)`.
   - If `crossRefSource !== null`: re-read entries, call `findRelatedPages` and
     `updateRelatedPages`. If `crossRefSource === null` (explicit skip), set
     `updatedSlugs = []`.
   - Append to log with op = `opts.logOp` and details from `opts.logDetails?.({ updatedSlugs })`.
   - Return `{ slug, updatedSlugs }`.

   **Important:** `writeWikiPageWithSideEffects` lives in `wiki.ts` but
   `findRelatedPages`/`updateRelatedPages` live in `ingest.ts`. Rather than
   creating a new circular import, **move `findRelatedPages` and
   `updateRelatedPages` from `ingest.ts` into `wiki.ts`** (they're pure helpers
   that already only depend on `wiki.ts` + `llm.ts`). Re-export them from
   `ingest.ts` so existing tests/imports still work:
   ```ts
   export { findRelatedPages, updateRelatedPages } from "./wiki";
   ```

2. **Refactor `ingest()` in `src/lib/ingest.ts`** to call
   `writeWikiPageWithSideEffects`. The remaining work in `ingest()` is:
   - slugify, save raw source, generate wiki content (LLM or fallback),
     extract summary,
   - call `writeWikiPageWithSideEffects({ slug, title, content: wikiContent,
     summary, crossRefSource: content, logOp: "ingest", logDetails: ({ updatedSlugs }) =>
     \`slug: ${slug} · updated ${updatedSlugs.length} related page(s)\` })`.
   - Return `{ rawPath, wikiPages: [slug, ...updatedSlugs], indexUpdated: true }`.

3. **Refactor `saveAnswerToWiki()` in `src/lib/query.ts`** the same way. Keep its
   "prepend heading if missing" logic and its "first-sentence summary" logic in
   place, then delegate to `writeWikiPageWithSideEffects({ ..., logOp: "save",
   crossRefSource: content, logDetails: ({ updatedSlugs }) => \`query answer
   saved as ${slug} · linked ${updatedSlugs.length} related page(s)\` })`.

4. **Tests.** Add a small test block in `src/lib/__tests__/wiki.test.ts` for
   `writeWikiPageWithSideEffects`:
   - writes the page file
   - inserts an index entry
   - updates an existing index entry on re-write (no duplicate)
   - appends a log line with the supplied op
   - skips cross-ref when `crossRefSource: null`
   The existing ingest and query tests MUST continue to pass unchanged —
   that's the point of the refactor.

## Verification

Must pass:
```
pnpm build && pnpm lint && pnpm test
```

All 168 existing tests must still pass (this is a pure refactor). The new
`writeWikiPageWithSideEffects` tests should add at least 4 more cases.

## Out of scope

- Do NOT add edit/delete flows in this task — that's task_02.
- Do NOT touch API routes or UI.
- Do NOT add YAML frontmatter, vector search, or new providers.
- Keep `logOp` values to the existing enum (`ingest | query | lint | save | other`).
