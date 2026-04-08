Title: Preserve & bump frontmatter on wiki edit
Files: src/app/api/wiki/[slug]/route.ts, src/lib/wiki.ts, src/components/WikiEditor.tsx, src/app/wiki/[slug]/edit/page.tsx, src/lib/__tests__/wiki.test.ts
Issue: none

## Goal

Fix the silent-frontmatter-loss bug in the edit flow (gap #2 / bug #2 from the assessment). Today `WikiEditor` seeds the textarea with the raw file content including the YAML block, and the PUT route writes the body verbatim. Users who delete the YAML block (or who have no idea it's there) silently lose their metadata, and even disciplined users never get `updated` bumped on edit.

This task does **not** attempt the `deleteWikiPage` consolidation — that's task 3. Keep this change narrow.

## Design

Separate the body (what the user edits) from the frontmatter (what the system owns) on the edit surface.

1. **`src/app/wiki/[slug]/edit/page.tsx`**: currently calls `readWikiPage(slug)` and passes the full content to `<WikiEditor>`. Change it to call `readWikiPageWithFrontmatter(slug)` and pass only `parsed.content` (the body without the YAML block) as the `initialContent` prop to the editor. The editor textarea should no longer expose YAML to the user at all.
2. **`src/components/WikiEditor.tsx`**: no prop signature change needed — it already takes `initialContent: string`. Just make sure it posts that body (not wrapped) to the PUT route. If there is any concatenation currently splicing YAML back on the client, remove it. Keep the component simple.
3. **`src/app/api/wiki/[slug]/route.ts` PUT handler**: this is the critical change. Instead of writing the request body verbatim, it must:
   - Parse the incoming body (the editor's textarea contents — a plain markdown body, no YAML).
   - Read the existing page via `readWikiPageWithFrontmatter(slug)` to get the current `frontmatter` object.
   - Bump `frontmatter.updated` to today's date in `YYYY-MM-DD` format (use `new Date().toISOString().slice(0, 10)` — no date library).
   - Preserve `frontmatter.created`, `frontmatter.source_count`, `frontmatter.tags`, and any extra keys. If `created` is missing (legacy page), set it to the same date as `updated`.
   - Re-serialize: `serializeFrontmatter(frontmatter) + bodyFromRequest`. Use the existing `serializeFrontmatter` helper in `wiki.ts` — do not reinvent YAML writing.
   - Write the result via `writeWikiPage(slug, merged)` (or, if it makes sense and is safe, via `writeWikiPageWithSideEffects` with an `"edit"`-ish operation — but only if you do not need to widen `LogOperation`. If you'd need to add a new log op value, skip the side-effects path for this task and just use `writeWikiPage` + an `appendToLog` call using an existing op. Do not add new enum values in this task.)
4. **If `serializeFrontmatter` is not exported**, export it (it's in `src/lib/wiki.ts`). If it already handles the empty-frontmatter case by emitting no YAML block, great — leverage that so pages that truly have no metadata don't suddenly sprout an empty YAML block on first edit. If it always emits a block, that's acceptable too (we now own the metadata).

## Tests

Add tests in `src/lib/__tests__/wiki.test.ts` covering `serializeFrontmatter` if not already covered, particularly:
- Round-trip: `parseFrontmatter(serializeFrontmatter(fm)).frontmatter` equals the input for a non-trivial frontmatter object.
- Empty frontmatter: `serializeFrontmatter({})` either produces no YAML block or a parseable empty block that round-trips.

The PUT route itself isn't directly unit-tested today, so an integration-style test is out of scope for this task. Focus on library-level invariants.

## What NOT to do

- Do not touch `deleteWikiPage`, the LogOperation enum, the lint flow, or the query flow.
- Do not add new pages or routes.
- Do not change `MarkdownRenderer` (task 1's territory; they don't conflict).
- Do not add tag-editing UI. Tags stay system-owned for this task.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 212 existing tests must still pass. Manually verify the logic flow by reading the updated PUT handler: incoming body → read existing → merge frontmatter → bump updated → serialize → write. A legacy page with no YAML block must still edit cleanly (frontmatter starts empty, gets `updated` and `created` on first edit).
