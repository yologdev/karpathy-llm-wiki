Title: Log browsing UI and schema conventions file
Files: src/app/wiki/log/page.tsx, src/lib/wiki.ts, src/app/wiki/page.tsx
Issue: none

## Problem

Two small gaps from the founding vision:

1. **Log.md has no UI**: `appendToLog()` in `wiki.ts` writes chronological entries to `log.md` on every ingest, but there's no way to view the log in the web app. The founding vision describes log.md as a first-class artifact: "an append-only record of what happened and when — ingests, queries, lint passes" with a "timeline of the wiki's evolution."

2. **No link to log from wiki index**: The wiki browse page at `/wiki` lists content pages but doesn't surface the log.

## Solution

### Part 1: Log browsing page at `/wiki/log`

Create a new page at `src/app/wiki/log/page.tsx` that:
- Reads `log.md` from the wiki directory using `readWikiPage('log')` or direct filesystem read
- Renders it with the `MarkdownRenderer` component
- Shows a friendly empty state if no log exists yet ("No activity logged yet. Ingest some content to see the timeline.")
- Has proper page title and NavHeader

### Part 2: Link to log from wiki index

Update `src/app/wiki/page.tsx` to add a link to the log page, separate from content pages. Something like a "Wiki Timeline" or "Activity Log" link at the top of the page, styled distinctly from content page links.

### Part 3: Read log helper

Add a `readLog()` function to `wiki.ts` that reads log.md and returns its content (or null if it doesn't exist). This is a thin wrapper but keeps the filesystem access pattern consistent.

## Implementation Details

The log page is a simple server component:
```tsx
// src/app/wiki/log/page.tsx
import { readLog } from '@/lib/wiki';
import { NavHeader } from '@/components/NavHeader';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

export default async function LogPage() {
  const logContent = await readLog();
  // Render with MarkdownRenderer or show empty state
}
```

The wiki index gets a small addition:
```tsx
// Add before or after the page list
<Link href="/wiki/log">📋 Activity Log</Link>
```

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must still pass. The new page should be accessible at `/wiki/log` and build cleanly. No new tests strictly required (it's a simple read-and-render page), but if the agent adds one for `readLog()` in `wiki.test.ts`, that's fine.
