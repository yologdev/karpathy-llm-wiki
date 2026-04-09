Title: Raw source browsing UI
Files: src/app/raw/page.tsx (new), src/app/raw/[slug]/page.tsx (new), src/app/api/raw/[slug]/route.ts (new), src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Problem

`raw/` is the immutable source of truth for everything the LLM has ever been fed, but the app never surfaces it. Users can't see which raw files exist, can't click through from a wiki page to the source that produced it, and can't verify citations against the original text. SCHEMA.md's "Known gaps" section explicitly calls this out, and the assessment flags it as gap #2.

This task builds a minimal read-only `/raw` browser. No writes, no delete, no edit.

## Scope

Small, self-contained, all read-only. Four new endpoints/pages + one library function.

### 1. Add a `listRawSources()` helper to `src/lib/wiki.ts`

```ts
export interface RawSource {
  slug: string;        // the filename without extension
  filename: string;    // e.g. "llm-wiki-pattern.md"
  size: number;        // bytes
  modified: string;    // ISO string
}

export async function listRawSources(): Promise<RawSource[]>
```

Implementation:
- Use `getRawDir()` (already exported).
- Read all files in `raw/` (non-recursive is fine — `raw/` is flat).
- Skip dotfiles and directories.
- For each file: `fs.stat` for size + mtime, derive `slug` from the basename (strip the last extension only).
- Sort by `modified` descending (newest first).
- If `raw/` doesn't exist, return `[]` (don't throw).

Also add a `readRawSource(slug: string)` helper that:
- Validates the slug using the existing `validateSlug()` path-traversal guard (if slug includes a dot for the extension, sanitise it first — or require callers to pass the slug without extension and the helper reconstructs the filename by scanning the directory). Pick whichever is simpler and safer.
- Actually: simplest and safest is to have this take the slug (no extension), list the raw dir, find the matching file, then `fs.readFile` it. Throw if not found. Return `{ slug, filename, content, size, modified }`.
- Do NOT allow reading files outside `raw/`. The list-and-match approach naturally prevents traversal.

### 2. New server page `src/app/raw/page.tsx`

Simple list view mirroring `src/app/wiki/page.tsx` structure:
- Page title "Raw Sources"
- Short explanatory subtitle ("Immutable source documents. The LLM's memory is built from these.")
- If empty: helpful message pointing to `/ingest`.
- Otherwise: list with filename, size (formatted: `1.2 KB`, `45 KB`, `2.1 MB`), relative modified date. Each item links to `/raw/[slug]`.

### 3. New server page `src/app/raw/[slug]/page.tsx`

- Calls `readRawSource(params.slug)`.
- If not found, call `notFound()` from `next/navigation`.
- Renders:
  - Breadcrumb / back link to `/raw`
  - Filename as H1
  - Metadata strip (size, modified date)
  - A `<pre className="whitespace-pre-wrap text-sm ...">` block with the raw content. Do NOT run through the markdown renderer — raw sources are displayed as plain text, because they may be HTML, plain text, or markdown, and we want users to see exactly what the LLM was fed. Truncate at, say, 500 KB with a "truncated, view file directly" note to avoid blowing up the browser.

### 4. New API route `src/app/api/raw/[slug]/route.ts`

A GET handler that returns the raw source content as `text/plain` (for future programmatic access / download). Keep it tiny — it just wraps `readRawSource()`. Return 404 on not-found.

This route is optional but cheap; include it so the `/raw/[slug]` page can link "View raw" → `/api/raw/[slug]` for a plain-text download.

### 5. NavHeader

Add a "Raw" link to `src/components/NavHeader.tsx` so users can reach `/raw` from the top nav. Match the existing link styling.

### 6. Tests

Extend `src/lib/__tests__/wiki.test.ts` with tests for `listRawSources()` and `readRawSource()`:
- Empty dir returns `[]`.
- Multiple files return all of them, sorted by modified desc.
- Dotfiles skipped.
- `readRawSource('known-slug')` returns content.
- `readRawSource('nonexistent')` throws.
- `readRawSource('../../etc/passwd')` throws (path traversal guard). This is the critical test — verify the guard actually works.

Use the existing temp-dir test harness pattern (look at how `wiki.test.ts` sets up `WIKI_DIR` / `RAW_DIR` for isolation).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Manually: drop a file into `raw/`, visit `/raw`, click through, confirm rendering.

## File budget

5 files touched:
1. `src/lib/wiki.ts` (add 2 functions + 1 type export)
2. `src/lib/__tests__/wiki.test.ts` (add tests)
3. `src/app/raw/page.tsx` (new)
4. `src/app/raw/[slug]/page.tsx` (new)
5. `src/components/NavHeader.tsx` (add "Raw" link)

Skip `src/app/api/raw/[slug]/route.ts` if you hit the 5-file limit — the UI pages are the priority.

## Out of scope

- Linking from each wiki page back to its raw sources (requires frontmatter `sources` → file mapping, separate task).
- Editing or deleting raw sources — they are immutable.
- Diff between raw source and derived wiki page.
- Uploading raw sources directly (use `/ingest` for that).
