Title: Fix URL ingestion with proper HTML-to-text parsing
Files: package.json, src/lib/ingest.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Problem

The journal from session 5 says `@mozilla/readability` and `linkedom` were added, but they are NOT in `package.json`. The current `stripHtml()` in `ingest.ts` uses fragile regex-based HTML stripping that produces garbled output for real-world web pages (tables become gibberish, nested divs create repeated text, JavaScript-heavy sites include script content, etc.). URL ingestion — a core feature — is effectively broken for most real websites.

## Solution

1. **Install dependencies**: `pnpm add @mozilla/readability linkedom`
2. **Replace `stripHtml()` usage in `fetchUrlContent()`** with proper Readability-based extraction:
   - Parse the HTML with `linkedom`'s `parseHTML`
   - Run `@mozilla/readability`'s `Readability` on the parsed DOM
   - Extract the article's text content and title from Readability's output
   - Keep `stripHtml()` as a fallback for when Readability fails to extract an article (some pages aren't article-shaped)
3. **Update `extractTitle()`** to prefer Readability's title over the regex `<title>` extraction
4. **Update tests**: Add test cases for `fetchUrlContent` covering the Readability path. Existing tests for `stripHtml` should still pass since it remains as fallback.

## Implementation Details

In `fetchUrlContent()`:
```typescript
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

// After fetching HTML:
const { document } = parseHTML(html);
const reader = new Readability(document);
const article = reader.parse();

if (article && article.textContent) {
  title = article.title || extractTitle(html) || new URL(url).hostname;
  content = article.textContent;
} else {
  // Fallback to regex stripping
  title = extractTitle(html) || new URL(url).hostname;
  content = stripHtml(html);
}
```

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 133 existing tests must still pass. New tests should cover the Readability path.
