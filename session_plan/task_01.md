Title: Test suite for fetch.ts — SSRF protection, HTML extraction, URL validation
Files: src/lib/__tests__/fetch.test.ts
Issue: none

Write a comprehensive test suite for `src/lib/fetch.ts` (403 lines), the most complex untested module in the project. This module handles URL fetching with SSRF protection, HTML-to-text extraction via Readability, and content-type/size validation — all security-critical logic with zero dedicated tests.

## What to test

### Pure functions (no mocking needed)

1. **`isUrl(input)`** — accepts `http://` and `https://`, rejects everything else (ftp, mailto, relative paths, empty, whitespace-padded)

2. **`stripHtml(html)`** — removes script/style/nav/header/footer/noscript tags entirely, strips remaining tags, decodes HTML entities (named: `&amp;`, `&mdash;`, `&hellip;`, etc.; numeric: `&#123;`, `&#x1F600;`), collapses whitespace

3. **`extractTitle(html)`** — extracts `<title>` content, strips inner tags, collapses whitespace, returns empty string when not found

4. **`extractWithReadability(html)`** — returns `{ title, textContent }` for well-formed article HTML, returns `null` for non-article HTML (e.g. empty body, no main content)

5. **`validateUrlSafety(url)`** — the SSRF protection layer. Must test:
   - Blocks `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`
   - Blocks private IPv4 ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `169.254.x.x`
   - Blocks private IPv6: `fd00::`, `fe80::`
   - Blocks IPv4-mapped IPv6: `::ffff:127.0.0.1`, `::ffff:7f00:1`
   - Blocks `.local`, `.internal`, `.localhost` suffixes
   - Blocks non-HTTP schemes (`ftp://`, `file://`, `javascript:`)
   - Allows valid public URLs: `https://example.com`, `http://93.184.216.34`
   - Throws with descriptive error messages

### `fetchUrlContent` (needs fetch mocking)

6. **Happy path** — mock `fetch` to return HTML with a `<title>` and article content, verify title and content extraction

7. **Content-Type rejection** — mock `fetch` returning `application/pdf`, verify error thrown

8. **Content-Length rejection** — mock `fetch` with Content-Length exceeding `MAX_RESPONSE_SIZE`

9. **Redirect following** — mock `fetch` returning 301 with Location header, then 200 on second call

10. **Redirect SSRF** — mock `fetch` returning 301 redirecting to `http://127.0.0.1`, verify blocked

11. **Too many redirects** — mock `fetch` returning 301s repeatedly, verify error after MAX_REDIRECTS

12. **Plain text pass-through** — mock `fetch` returning `text/plain`, verify no HTML parsing

13. **Non-ok status** — mock `fetch` returning 404, verify error thrown

14. **No content extracted** — mock `fetch` returning empty HTML body, verify error thrown

## Implementation notes

- Import functions directly from `src/lib/fetch.ts`
- For `fetchUrlContent` tests, use `vi.stubGlobal('fetch', ...)` to mock the global fetch
- Use `vi.unstubAllGlobals()` in `afterEach` to clean up
- For streaming body tests, create a mock `ReadableStream` with a `getReader()` method
- Group tests with `describe` blocks: "isUrl", "stripHtml", "extractTitle", "extractWithReadability", "validateUrlSafety", "fetchUrlContent"
- Target ~50+ tests covering all the edge cases above

Verify: `pnpm build && pnpm lint && pnpm test`
