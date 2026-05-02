Title: Discussion badge on wiki index and page header
Files: src/lib/talk.ts, src/components/WikiPageCard.tsx, src/app/wiki/page.tsx, src/lib/__tests__/talk.test.ts
Issue: none

## Why

Pages with active/open discussion threads don't show any indicator on the wiki index or page view. Users can't discover that a page has editorial disputes without navigating to each page individually. This is the #4 gap in the Phase 2 close-out list.

## What to do

1. **`src/lib/talk.ts`** — Add a new lightweight function `getDiscussionStats(pageSlug: string): Promise<{ total: number; open: number }>` that reads the discuss file and counts threads by status. This avoids loading full thread content when all we need is a count.

   Also add a batch version `getDiscussionStatsForSlugs(slugs: string[]): Promise<Map<string, { total: number; open: number }>>` that scans the discuss directory once and returns stats for all requested slugs. This is efficient for the wiki index page which shows many pages at once.

2. **`src/components/WikiPageCard.tsx`** — Accept an optional `discussionCount?: { total: number; open: number }` prop. When `open > 0`, show a small badge: a 💬 icon with the open count (e.g., "💬 2 open"). Style it similar to the existing tag badges — inline, small, colored to draw attention (amber/yellow for open discussions).

3. **`src/app/wiki/page.tsx`** — In the server component that renders the wiki index, import `getDiscussionStatsForSlugs` and call it with the list of page slugs. Pass the stats down to each `WikiPageCard`.

4. **`src/lib/__tests__/talk.test.ts`** — Add tests for `getDiscussionStats`:
   - Returns `{ total: 0, open: 0 }` when no discuss file exists
   - Returns correct counts with a mix of open/resolved/wontfix threads
   - Batch version returns a map with correct per-slug stats

## Verify

```sh
pnpm build && pnpm lint && pnpm test
```
