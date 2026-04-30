Title: Decompose fetch.ts — extract html-parse.ts and url-safety.ts
Files: src/lib/html-parse.ts (new), src/lib/url-safety.ts (new), src/lib/fetch.ts (modified)
Issue: none

## Goal

`fetch.ts` is the largest production file at 715 lines. It contains three unrelated responsibilities:
1. HTML parsing/conversion (stripHtml, htmlToMarkdown, decodeEntities, extractTitle, extractWithReadability)
2. URL safety/SSRF protection (isPrivateIPv4, isPrivateIPv6, validateUrlSafety, BLOCKED_HOST_SUFFIXES, BLOCKED_HOSTNAMES)
3. URL fetching and image downloading (fetchUrlContent, downloadImages, sanitizeImageFilename, isUrl)

Extract #1 into `src/lib/html-parse.ts` and #2 into `src/lib/url-safety.ts`. Keep `fetch.ts` as the URL fetching module (isUrl, fetchUrlContent, downloadImages) that imports from the new modules.

## Key constraint: backwards compatibility

All existing imports from `"./fetch"` or `"@/lib/fetch"` must continue working. Re-export everything from `fetch.ts`:

```ts
// Re-export HTML parsing utilities for backwards compatibility
export { stripHtml, htmlToMarkdown, extractTitle, extractWithReadability } from "./html-parse";
export { validateUrlSafety } from "./url-safety";
```

### New file: `src/lib/html-parse.ts`
Move these functions:
- `decodeEntities` (private helper)
- `stripHtml`
- `htmlToMarkdown`
- `extractTitle`
- `extractWithReadability`

Dependencies: Only uses `@mozilla/readability` and `jsdom` (already in project).

### New file: `src/lib/url-safety.ts`
Move these:
- `BLOCKED_HOST_SUFFIXES` (const)
- `BLOCKED_HOSTNAMES` (const)
- `isPrivateIPv4` (private helper)
- `isPrivateIPv6` (private helper)
- `validateUrlSafety`

Dependencies: Only `node:net` and `node:url`.

### Modified: `src/lib/fetch.ts`
Remove the moved functions. Import `validateUrlSafety` from `"./url-safety"` (used in `fetchUrlContent`). Import nothing from html-parse (htmlToMarkdown is used in `fetchUrlContent` — wait, check this). Actually `fetchUrlContent` calls `htmlToMarkdown`, `extractTitle`, and `extractWithReadability` — so fetch.ts needs to import from html-parse.ts.

Add re-exports at top for backwards compatibility.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests in `fetch.test.ts` and `ingest.test.ts` must pass unchanged — they import from `"../fetch"` which re-exports everything.
