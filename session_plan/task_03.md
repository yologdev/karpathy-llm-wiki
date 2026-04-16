Title: Add "format as table" option to query results
Files: src/lib/query.ts, src/app/api/query/route.ts, src/app/api/query/stream/route.ts, src/app/query/page.tsx, src/lib/__tests__/query.test.ts
Issue: none

## Goal

`llm-wiki.md` §Query calls out that answers "can take different forms — a markdown page, a comparison table, a slide deck, a chart, a canvas." We currently produce only free-form markdown. Adding a simple "format as table" toggle is a low-cost step toward that vision and materially improves comparison-style queries ("compare X and Y", "list all Z").

This task is intentionally minimal: one new answer format, piped through the existing query pipeline.

## What to do

1. **In `src/lib/query.ts`:**
   - Add an optional `format?: "prose" | "table"` parameter to `query()` (default `"prose"`).
   - Add an optional parameter to `buildQuerySystemPrompt()` for the format hint.
   - When `format === "table"`, append a short instruction to the system prompt like: `"Format your answer as a markdown comparison table where possible. Include a short prose lead-in (1-2 sentences) before the table. Every column header should be meaningful. Cite sources as [[slug]] in a final 'Sources' row or paragraph."`
   - Keep `format === "prose"` as the current behavior (no prompt changes).

2. **In `src/app/api/query/route.ts` and `src/app/api/query/stream/route.ts`:**
   - Accept an optional `format` field in the POST body. Validate it's one of the two values; default to "prose".
   - Pass through to `query()` / `buildQuerySystemPrompt()` as appropriate. For the streaming route, the prompt construction happens inline — inject the format hint the same way.

3. **In `src/app/query/page.tsx`:**
   - Add a small format selector (radio buttons or a segmented control) near the question textarea: "Answer format: (•) Prose  ( ) Table".
   - Wire it into both the streaming and non-streaming POST calls (whichever the page uses — check current code).
   - Persist choice in component state only; no settings/config changes needed.

4. **Tests:** Add one test to `src/lib/__tests__/query.test.ts` that calls `buildQuerySystemPrompt` with `format: "table"` and asserts the returned prompt contains a table-formatting instruction. Don't call the real LLM.

5. Verify: `pnpm build && pnpm lint && pnpm test`. All existing tests must still pass; one new test added.

## Constraints

- At most 5 files touched.
- Do NOT refactor the query pipeline beyond adding the parameter pass-through.
- Do NOT add slide-deck / chart / canvas formats — that's a much bigger scope.
- Default behavior unchanged: existing callers without `format` get prose, identical to today.
- UI: keep the format selector small and unobtrusive. A simple `<select>` or two radio buttons is fine; no need for styled toggles.

## Out of scope

- Chart rendering, slide decks, other formats.
- Saving format preference in config.
- Format-specific citation styles beyond what the prompt hint requests.
