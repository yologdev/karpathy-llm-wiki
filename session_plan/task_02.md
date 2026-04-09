Title: Wiki index — search, tag filter, and metadata pills
Files: src/app/wiki/page.tsx, src/components/WikiIndexClient.tsx (new), src/lib/wiki.ts, src/lib/types.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Problem

`src/app/wiki/page.tsx` is a 61-line flat list — no search, no filter, no metadata surfacing. Frontmatter already stores `tags`, `updated`, and `source_count` on every page, but the index shows only title + summary. Once a wiki grows past ~20 pages this becomes unusable. Assessment gap #3 and #9.

## Scope

Two layers of change: the data layer needs to surface more per-page info, and the UI layer needs a small client component for search/filter.

### 1. Extend `IndexEntry` + `listWikiPages`

In `src/lib/types.ts`, extend `IndexEntry`:

```ts
export interface IndexEntry {
  slug: string;
  title: string;
  summary: string;
  // New optional fields (optional so old index.md files still parse):
  tags?: string[];
  updated?: string; // ISO string
  sourceCount?: number;
}
```

In `src/lib/wiki.ts`, update `listWikiPages()` so that for each entry, it reads the page's frontmatter (via `readWikiPageWithFrontmatter` which already exists) and fills in `tags`, `updated`, and `sourceCount` when present. If reading frontmatter fails for any page, log a warning and fall back to the plain entry — do not let one bad page break the whole index.

Performance note: `listWikiPages` is called on every `/wiki` page render. Reading every file is fine for now (small wikis, local disk) but wrap the per-page read in a `Promise.all` so it's parallel, not sequential.

### 2. New client component `src/components/WikiIndexClient.tsx`

A `"use client"` component that takes `pages: IndexEntry[]` as props and renders:

- A search input (filters by title + summary substring, case-insensitive).
- A horizontal scrollable row of tag pills derived from the union of all pages' tags. Clicking a tag toggles it as an active filter. Multiple tags = AND (page must have all selected tags).
- A "clear filters" button when any filter is active.
- The filtered list, each item rendered as:
  - Title (bold)
  - Summary (muted)
  - A small metadata row below: tag pills for THAT page + relative updated date (e.g. "updated 3d ago") + source count if > 0.

Use only `useState` — no router, no server actions. All filtering is in-browser.

For the relative date formatter, write a tiny local helper (`formatRelative(iso: string): string`) — do NOT add `date-fns` or `dayjs` as a dep. A simple function handling seconds/minutes/hours/days/weeks/months is enough.

Styling: match existing Tailwind conventions in the repo (`border border-foreground/10`, `hover:border-foreground/30`, etc.). Look at `src/app/wiki/[slug]/page.tsx`'s metadata strip for the tag pill pattern and reuse its classes.

### 3. Update `src/app/wiki/page.tsx`

Keep it as a server component. Call `listWikiPages()`, pass the result straight into `<WikiIndexClient pages={pages} />`. Keep the page title and "Activity Log" button at the top — those stay server-rendered. Remove the redundant home/ingest links in the page header since `NavHeader` already provides top-level nav (this closes assessment polish item #11 for this page).

### 4. Tests

Extend `src/lib/__tests__/wiki.test.ts` with a test that creates 2–3 pages with frontmatter (tags, updated, source_count), calls `listWikiPages()`, and asserts the new fields come through correctly. Also test the fallback: a page with NO frontmatter still returns a valid `IndexEntry` with the new fields undefined (or empty).

Do NOT add component tests for `WikiIndexClient` — we don't have React Testing Library set up and adding it is out of scope. The component is small and its logic is obvious.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Manually sanity-check: `pnpm dev`, visit `/wiki` with existing pages, confirm search works, tag filter works, metadata renders.

## Out of scope

- Sort options (by updated / title / source count). Can follow later.
- Pagination. Not needed yet.
- Server-side search. Client-side is fine at current scale.
- Editing tags (assessment gap #10) — separate task.
- Tag editor component. Tags are read-only in this task.
