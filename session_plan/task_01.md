Title: Add client-side pagination to wiki index
Files: src/components/WikiIndexClient.tsx, src/components/WikiPageCard.tsx

Issue: none

## Description

The wiki index currently renders ALL pages in a single list. When the wiki grows to hundreds of pages, this creates a laggy, overwhelming UI. Add client-side pagination.

### Implementation

In `WikiIndexClient.tsx`:

1. Add a `page` state variable (default: 1) and a `PAGE_SIZE` constant (20).
2. After computing `filtered`, slice it for the current page: `filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)`.
3. Compute `totalPages = Math.ceil(filtered.length / PAGE_SIZE)`.
4. Reset `page` to 1 whenever filters change (add `page` reset in the effect of filter state changes — simplest is to reset in the `useMemo` dependency array by calling `setPage(1)` in each filter setter, or add a `useEffect` that watches filter state).
5. Below the page list, render pagination controls:
   - "Previous" / "Next" buttons, disabled at boundaries.
   - Page number indicator: "Page X of Y".
   - Only show pagination controls when `totalPages > 1`.
6. Style pagination controls consistently with existing UI (foreground/background vars, border-foreground/20, etc.).

### Details

- Keep the existing "N pages (M shown)" counter in WikiIndexToolbar — it already reflects filter counts.
- The `WikiPageCard` component doesn't need changes.
- Reset to page 1 when search term, tags, sort, or date filters change.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All must pass. No new tests needed — this is a pure presentation change with no API surface.
