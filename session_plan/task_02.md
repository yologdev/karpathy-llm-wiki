Title: Download source images locally during ingest
Files: src/lib/fetch.ts, src/lib/ingest.ts, src/lib/config.ts (read for data dir), src/lib/__tests__/fetch.test.ts
Issue: none

## Description

The founding vision (`llm-wiki.md`) describes downloading source images to `raw/assets/` for offline access. Currently, images are preserved as `![alt](url)` markdown references during ingest but the actual image files are not downloaded. SCHEMA.md lists this as a known gap.

### What to build

**In `src/lib/fetch.ts`**, add a function `downloadImages`:

```typescript
/**
 * Download images referenced in markdown content to the local filesystem.
 * Rewrites image URLs in the markdown to point to local paths.
 * 
 * @param markdown - Markdown content with `![alt](url)` image references
 * @param slug - The source slug (used to namespace image files)
 * @param rawDir - The raw directory path
 * @returns The markdown with rewritten image URLs
 */
export async function downloadImages(
  markdown: string,
  slug: string,
  rawDir: string,
): Promise<string>
```

Implementation details:
- Parse markdown for `![alt](url)` patterns where URL is an absolute HTTP(S) URL
- Skip data URIs and relative paths (already local)
- Download each image to `<rawDir>/assets/<slug>/<filename>` (create directories as needed)
- Use the original filename from the URL, sanitized (no query params, no path traversal)
- If multiple images share a name, append a counter suffix
- Rewrite the markdown `![alt](url)` → `![alt](assets/<slug>/<filename>)`
- On download failure (network error, non-200 status, non-image content-type), keep the original URL and log a warning — don't fail the ingest
- Respect the existing `FETCH_TIMEOUT_MS` and `MAX_RESPONSE_SIZE` constants
- Limit to at most 20 images per source to avoid abuse

**In `src/lib/ingest.ts`**, call `downloadImages` after fetching URL content and before saving to raw:
- After `fetchUrlContent()` returns markdown, call `downloadImages(content, slug, rawDir)` 
- Only do this for URL ingests (not text paste — text paste images are likely already external references the user intentionally included)

**In `src/lib/__tests__/fetch.test.ts`**, add tests for `downloadImages`:
- Test: rewrites absolute image URLs to local paths
- Test: skips data URIs and relative paths  
- Test: handles download failures gracefully (keeps original URL)
- Test: limits to 20 images max
- Test: sanitizes filenames (strips query params, prevents traversal)
- Mock `fetch` calls — do NOT make real network requests in tests

### Update SCHEMA.md

Remove the "local image download" item from the known gaps section since this closes it.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must continue to pass. New tests must pass.
