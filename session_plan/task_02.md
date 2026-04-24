Title: Re-ingest API endpoint for source freshness
Files: src/app/api/ingest/reingest/route.ts, src/lib/ingest.ts, src/app/wiki/[slug]/page.tsx, src/lib/__tests__/ingest.test.ts
Issue: none

## Description

Add a re-ingest endpoint that re-fetches a previously ingested URL and updates the
wiki page. This is the "scheduled re-ingestion" capability from the founding vision —
sources shouldn't be one-shot. The user should be able to click "Re-ingest" on a wiki
page that has a `source_url` in its frontmatter, triggering a fresh fetch and LLM
processing.

### Prerequisite

Task 01 must be completed first (source_url in frontmatter).

### Changes

1. **`src/lib/ingest.ts`** — Add a `reingest(slug: string)` function that:
   - Reads the wiki page's frontmatter to get `source_url`
   - Throws if no `source_url` is present ("Cannot re-ingest: no source URL recorded")
   - Calls `fetchUrlContent(source_url)` to get fresh content
   - Calls `ingest(title, freshContent, { sourceUrl: source_url })` to update the page
   - Returns the standard `IngestResult`

2. **`src/app/api/ingest/reingest/route.ts`** — POST endpoint accepting `{ slug: string }`.
   Calls `reingest(slug)` and returns the result as JSON. Returns 400 if slug missing,
   404 if page not found, 422 if no source_url on the page.

3. **`src/app/wiki/[slug]/page.tsx`** — Add a "Re-ingest" button that appears only
   when the page has a `source_url` in its frontmatter. On click, POST to
   `/api/ingest/reingest` with the slug. Show loading state and success/error feedback.
   Read frontmatter from the existing page data (it's already available via
   `readWikiPageWithFrontmatter`).

4. **`src/lib/__tests__/ingest.test.ts`** — Add tests for `reingest()`:
   - Succeeds when page has `source_url`, re-fetches and updates
   - Throws when page has no `source_url`
   - Throws when page doesn't exist

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
