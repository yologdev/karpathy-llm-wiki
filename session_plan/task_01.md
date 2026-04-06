Title: URL ingestion — fetch and convert web pages
Files: src/lib/ingest.ts, src/app/ingest/page.tsx, src/app/api/ingest/route.ts, src/lib/__tests__/ingest.test.ts

Issue: none

## Description

The founding vision says "paste a URL or text" but currently only plain text is supported. This is the biggest UX gap — most users want to ingest web articles by URL rather than copy-pasting text.

### What to build

**1. URL detection and fetching in `src/lib/ingest.ts`**

Add a new function `fetchUrlContent(url: string): Promise<{ title: string; content: string }>` that:
- Takes a URL string
- Fetches the page HTML using Node.js native `fetch()`
- Extracts the text content by stripping HTML tags. Use a simple but effective approach:
  - Remove `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` elements and their contents entirely
  - Strip remaining HTML tags
  - Collapse whitespace
  - Extract `<title>` tag for the title (fallback to URL hostname)
- No external dependency needed — use regex-based HTML stripping (good enough for v1)
- Returns `{ title, content }` for feeding into the existing ingest pipeline

Add a helper `isUrl(input: string): boolean` that checks if a string looks like a URL (starts with `http://` or `https://`).

Add a new entry point: `ingestUrl(url: string): Promise<IngestResult>` that:
1. Calls `fetchUrlContent(url)`
2. Calls the existing `ingest(title, content)` with the extracted data
3. Returns the same `IngestResult`

**2. Update API route `src/app/api/ingest/route.ts`**

Accept an optional `url` field in the POST body. Logic:
- If `url` is provided (and is a valid URL string), use `ingestUrl(url)` 
- If `title` + `content` are provided (existing path), use `ingest(title, content)` as before
- If both are provided, URL takes precedence
- Validate: at least one path must be satisfied, return 400 otherwise

**3. Update UI `src/app/ingest/page.tsx`**

Add a tab or toggle at the top of the form: "Text" | "URL"
- **Text mode** (default): existing title + content fields (unchanged)
- **URL mode**: single URL input field. Title is auto-extracted from the page.
- Switching modes clears the other mode's fields
- When in URL mode, POST body sends `{ url }` instead of `{ title, content }`

Keep it simple — a two-button toggle above the form, not a full tab component.

**4. Add tests in `src/lib/__tests__/ingest.test.ts`**

Add tests for:
- `isUrl()` — recognizes http/https URLs, rejects plain text
- `fetchUrlContent()` — mock `global.fetch` to return sample HTML, verify title and content extraction
- HTML stripping: removes script/style tags, preserves text content
- `ingestUrl()` — integration test with mocked fetch

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing 43 tests must continue to pass, plus new tests for URL ingestion.
