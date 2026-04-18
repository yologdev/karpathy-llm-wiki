Title: Test suite for search.ts (pure filesystem functions)
Files: src/lib/__tests__/search.test.ts
Issue: none

Add a dedicated test suite for `search.ts` (265 lines). Focus on the pure filesystem/string functions — skip the LLM-dependent `findRelatedPages` function (it requires mocking callLLM and is better covered by integration tests later).

## Functions to test

### searchWikiContent(query, maxResults?)
- Searches all wiki page files for case-insensitive term matches
- Returns `{ slug, title, summary, snippet, score }[]`
- Scores by number of matching terms (OR semantics)
- Sorts by score descending, then title alphabetically
- Skips `index.md` and `log.md`
- Respects `maxResults` limit (default 10)
- Returns empty array for empty query
- Returns empty array for whitespace-only query
- Builds snippet around first match with `…` ellipsis for context
- Extracts title from first `# Heading` in content
- Falls back to slug as title when no heading
- Returns empty array when wiki directory doesn't exist

### findBacklinks(targetSlug)
- Returns `{ slug, title }[]` of pages that link to `targetSlug`
- Skips index and log pages
- Skips the target page itself
- Uses `hasLinkTo` (from links.ts) for proper link detection
- Returns empty array when no pages link to target

### updateRelatedPages(newSlug, newTitle, relatedSlugs)
- Appends "See also" links to related pages
- Skips pages that already link to newSlug
- Extends existing "See also" sections rather than creating duplicates
- Returns array of actually-modified slugs

## Test setup

Use temp directory pattern matching existing tests:
- Set `process.env.WIKI_DIR` and `process.env.RAW_DIR` to temp directories
- Write test markdown files directly to the wiki temp dir
- Clean up after each test

For `findBacklinks` and `updateRelatedPages`, write wiki page files with known link patterns and verify detection. Don't mock `readWikiPage`/`writeWikiPage` — use real filesystem operations for integration-level confidence.

Verify: `pnpm build && pnpm lint && pnpm test`
