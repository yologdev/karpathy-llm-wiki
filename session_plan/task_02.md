Title: Extract QueryHistorySidebar component from query/page.tsx
Files: src/components/QueryHistorySidebar.tsx (new), src/app/query/page.tsx

Issue: none

## Context

`src/app/query/page.tsx` is 520 lines — the single largest UI file in the repo and the recurring "next" item named in the last three journal entries ("component decomposition on remaining large pages (query, lint)"). The history sidebar is the most self-contained chunk: it's a pure render of a `history` array with an `onSelect` callback and a `currentId`.

This session we extract **only the sidebar** — small, safe, independently verifiable. Future sessions can pull out the save-flow and streaming handlers.

## What to extract

The `<aside>` block at roughly lines 470–516 of `src/app/query/page.tsx` renders "Recent Queries". Move it verbatim into a new client component:

**`src/components/QueryHistorySidebar.tsx`**

```tsx
"use client";

import { formatRelativeTime } from "@/lib/format";

export interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  timestamp: string;
  savedAs?: string;
}

interface Props {
  history: HistoryEntry[];
  loading: boolean;
  currentId: string | null;
  onSelect: (entry: HistoryEntry) => void;
}

export function QueryHistorySidebar({ history, loading, currentId, onSelect }: Props) {
  // ...the existing <aside>...</aside> JSX, unchanged markup and classes...
}
```

Preserve **every class name, aria attribute, key, and truncation call** exactly as it is in the current JSX. This is a pure lift-and-shift: zero behavior change. If `truncate()` is used inside the sidebar (check `line 33` helper), either move it into the new file or duplicate it locally — don't export it from page.tsx since page.tsx is a client component, not a module.

## Update the page

In `src/app/query/page.tsx`:
- Remove the local `HistoryEntry` interface and import it from the new component (`import { QueryHistorySidebar, type HistoryEntry } from "@/components/QueryHistorySidebar"`).
- Replace the `<aside>...</aside>` block with:
  ```tsx
  <QueryHistorySidebar
    history={history}
    loading={historyLoading}
    currentId={currentHistoryId}
    onSelect={loadHistoryEntry}
  />
  ```
- Remove the now-unused `formatRelativeTime` import if nothing else in page.tsx uses it (grep to confirm).
- Remove the top-level `truncate` helper if it's only used inside the sidebar (grep the file).

## Verification

```sh
pnpm build
pnpm lint
pnpm test
```

All 622 tests must still pass. There are no unit tests for the query UI itself, so the verification is pass-through — the page must render and the sidebar must show history correctly. Also:

1. Confirm `wc -l src/app/query/page.tsx` is now **meaningfully smaller** (expect ≤ ~475 lines).
2. Confirm no eslint warnings about unused imports in page.tsx (`formatRelativeTime`, `truncate` if removed).

## Out of scope

- Do not extract the save-flow UI, the streaming handler, or the submit form. One component per session.
- Do not add a delete-history button or any new feature. Pure extraction.
- Do not add unit tests for the new component unless trivial — we're shrinking complexity, not adding it.
- Do not change any API calls or fetch URLs.
