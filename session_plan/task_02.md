Title: Add Marp slide deck as a query answer format
Files: src/lib/query.ts, src/hooks/useStreamingQuery.ts, src/app/query/page.tsx, src/app/api/query/stream/route.ts

Issue: none

## Description

The founding vision (llm-wiki.md) explicitly lists "a slide deck (Marp)" as a query answer format. Currently only "prose" and "table" are supported. Add "slides" as a third format option.

### Implementation

**1. `src/lib/query.ts`** — Add slides format:

- Expand `QueryFormat` type: `export type QueryFormat = "prose" | "table" | "slides";`
- Add a new constant `SLIDES_FORMAT_INSTRUCTION` similar to `TABLE_FORMAT_INSTRUCTION`:
  ```
  Format your answer as a Marp slide deck. Use `---` to separate slides.
  The first slide should be a title slide with `# {question}`.
  Each subsequent slide should cover one key point with a heading and 2-4 bullet points.
  Keep slides concise — aim for 5-8 slides total.
  Include a final "Sources" slide citing wiki pages as [[slug]].
  Use standard Marp markdown (no custom directives needed).
  Start the response with the Marp front matter:
  ---
  marp: true
  ---
  ```
- In the `query()` function and `buildQuerySystemPrompt()`, handle `format === "slides"` by appending the slides instruction (same pattern as the table format branch).

**2. `src/hooks/useStreamingQuery.ts`** — Widen format type:

- Change the format state type from `"prose" | "table"` to `"prose" | "table" | "slides"` in the state declaration and the `UseStreamingQueryReturn` interface.

**3. `src/app/query/page.tsx`** — Add slides radio button:

- Add a third radio button for "slides" format in the fieldset, following the same pattern as prose/table.

**4. `src/app/api/query/stream/route.ts`** — Accept "slides" format:

- Update the format validation check to also accept `"slides"`.
- Update the `queryFormat` assignment to handle `"slides"`.

### Non-goals

- No Marp-to-HTML rendering (users can copy the Marp markdown and render it in Marp CLI, VS Code, or Marp.app). The MarkdownRenderer will display it as regular markdown with slide separators, which is readable.
- No changes to the non-streaming `/api/query` route — it also calls `query()` which will pick up the format automatically.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Existing query tests should still pass. The `TABLE_FORMAT_INSTRUCTION` tests in `query.test.ts` test the table path; the slides path follows the same pattern but doesn't need dedicated tests (format instructions are simple string constants).
