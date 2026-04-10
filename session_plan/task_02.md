Title: Batch ingest UI — multi-URL input with progress
Files: src/app/ingest/page.tsx, src/components/BatchIngestForm.tsx
Issue: none

Add a batch ingest UI that lets users paste multiple URLs (one per line) and process them
all at once with visual progress feedback. This consumes the batch API from task 01.

### Implementation

**1. Create `src/components/BatchIngestForm.tsx`** (~150 lines)

A self-contained React component for the batch flow:

- A `<textarea>` for pasting URLs (one per line), with a placeholder like
  "https://example.com/article-1\nhttps://example.com/article-2"
- A "Process All" button
- On submit: parse the textarea into an array of URLs, validate client-side (must be valid
  URLs, max 20), then POST to `/api/ingest/batch` with `{ urls }`
- Read the NDJSON streaming response line-by-line using `response.body.getReader()`
- Maintain a state array of `{ url, status: 'pending' | 'processing' | 'success' | 'error', result?, error? }`
- Render a progress list showing each URL with a status icon (⏳ pending, 🔄 processing,
  ✅ success, ❌ error) and the resulting wiki page slug on success
- After completion, show a summary: "X of Y URLs ingested successfully" with links to the
  new wiki pages

**2. Modify `src/app/ingest/page.tsx`**

- Add a third mode: `"batch"` alongside `"text"` and `"url"`
- Add a tab/button for "Batch URLs" in the mode switcher at the top
- When `mode === "batch"`, render `<BatchIngestForm />` instead of the single-URL/text form
- Keep the existing text and url modes completely untouched — only add the new branch

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Existing tests must still pass. The ingest page should build with no type errors.
The batch tab should appear in the UI alongside Text and URL modes.
