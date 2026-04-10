Title: Ingest preview mode — human-in-the-loop review before committing
Files: src/app/api/ingest/route.ts, src/app/ingest/page.tsx, src/lib/ingest.ts
Issue: none

## Description

The founding vision emphasizes: "I prefer to ingest sources one at a time and stay involved — I read the summaries, check the updates." Currently, ingest writes wiki pages immediately with no preview step. This is assessment gap #4 — the biggest philosophy gap between the implementation and the founding vision.

### Architecture: Two-phase ingest

Split ingest into two API phases:

**Phase 1: Preview** (`POST /api/ingest` with `{ preview: true }`)
- Runs all the existing ingest logic (fetch URL, clean HTML, generate wiki content via LLM, find related pages) but does NOT write anything to disk
- Returns the generated wiki page content, the slug, the title, the raw source content, and the list of related pages that would be updated
- The client can display this for user review

**Phase 2: Commit** (`POST /api/ingest` with `{ preview: false }` or without the flag)
- Same as current behavior — runs ingest and writes everything to disk
- This is backward-compatible: existing behavior (no preview flag) = immediate commit

### Changes to `src/lib/ingest.ts`

Add a `preview` option to the ingest function signature:

```typescript
export async function ingest(
  title: string,
  content: string,
  options?: { preview?: boolean }
): Promise<IngestResult>
```

When `preview: true`:
- Run the LLM to generate wiki content (this is the expensive part — we want users to review what the LLM produced)
- Call `findRelatedPages()` to identify what cross-refs would be added
- Return the result with a new field `previewContent: string` containing the generated markdown
- Do NOT call `writeWikiPageWithSideEffects()`, do NOT save raw source, do NOT update index/log

Add `previewContent?: string` to the `IngestResult` type in `src/lib/types.ts`.

### Changes to `src/app/api/ingest/route.ts`

Accept `preview` boolean from the request body. Pass it through to `ingest()`. Return the preview data.

### Changes to `src/app/ingest/page.tsx`

Replace the single "Ingest" button with a two-step flow:

1. **Step 1 — "Preview"** button: Calls the API with `preview: true`. On success, shows the generated wiki page content in a read-only MarkdownRenderer (or a simple `<pre>` block for the raw markdown). Shows the slug, related pages that would be updated, and two buttons:
   - **"Approve & Ingest"** — Calls the API again without preview (commits to disk). Shows the existing success screen.
   - **"Cancel"** — Returns to the form.

2. **Direct ingest** still works: Keep a secondary "Ingest directly" text button/link for power users who don't want to preview.

The UI state machine becomes:
```
form → (preview) → preview-view → (approve) → success
                                 → (cancel) → form
form → (direct ingest) → success
```

### Key considerations

- The preview call IS expensive (it calls the LLM). But the whole point is to let users read what the LLM produced before it's committed. The LLM is called once for preview, and if approved, the content from preview is passed to the commit phase (don't re-call the LLM).
- To avoid calling the LLM twice: the preview response should include the generated content, and the commit request should accept the pre-generated content as a field. Add `{ generatedContent: string, slug: string, rawContent: string, rawTitle: string }` to the commit request so it can skip the LLM call and go straight to writing.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

Existing ingest tests should still pass (the default behavior without `preview` flag is unchanged). The preview mode is additive.
