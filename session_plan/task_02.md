Title: Preserve images from source articles during ingest
Files: src/lib/fetch.ts, src/lib/ingest.ts, src/lib/__tests__/fetch.test.ts
Issue: none

## Description

The founding vision (`llm-wiki.md`) explicitly mentions downloading images
locally and having the LLM reference them. Currently, `extractWithReadability()`
uses `article.textContent` (plain text), which strips all `<img>` tags. This
means image-rich source articles lose all visual content during ingest.

### Changes

1. **src/lib/fetch.ts** — Modify `extractWithReadability()`:
   - Return `article.content` (sanitized HTML) in addition to `textContent`.
   - Add a new exported helper `htmlToMarkdown(html: string): string` that
     converts simple HTML to markdown, specifically preserving:
     - `<img src="..." alt="...">` → `![alt](src)`
     - `<a href="...">text</a>` → `[text](href)`
     - `<h1>`–`<h6>` → `#`–`######`
     - `<p>` → double newline
     - `<strong>`/`<b>` → `**text**`
     - `<em>`/`<i>` → `*text*`
     - `<ul>/<li>` → `- item`
     - Strip all other tags
   - In `fetchUrlContent()`, when Readability succeeds, use `htmlToMarkdown(article.content)`
     instead of `article.textContent`. This preserves image references as
     markdown `![alt](url)` syntax while still producing clean markdown text.
   - Keep the `stripHtml()` fallback path unchanged (it already handles
     non-Readability cases).

2. **src/lib/ingest.ts** — No changes needed if `fetchUrlContent()` returns
   markdown with image syntax. The LLM prompt already handles markdown input.
   However, review `chunkText()` to ensure `![...]()` lines aren't split
   mid-image-reference. If they are, add a simple guard.

3. **src/lib/__tests__/fetch.test.ts** — Add tests for `htmlToMarkdown()`:
   - Converts `<img>` tags to markdown image syntax
   - Converts `<a>` tags to markdown links
   - Preserves heading hierarchy
   - Strips unknown/dangerous tags
   - Handles empty/missing alt text: `![](src)`
   - Handles relative image URLs (pass through as-is)
   - Integration test: `extractWithReadability()` on HTML with images returns
     content containing `![` image references

### Important constraints

- Do NOT add any new npm dependencies. The HTML-to-markdown conversion should
  be a simple regex/string-based converter, not a full library like Turndown.
  We only need to handle the subset of HTML that Readability outputs (it already
  cleans the DOM significantly).
- Image URLs should be preserved as-is (absolute URLs from the source). The
  founding vision mentions downloading images locally as a future option, but
  for now just keeping the URLs is the right first step.
- Keep `MAX_CONTENT_LENGTH` truncation working correctly.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
