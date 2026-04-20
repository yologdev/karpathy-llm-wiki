Title: Mobile responsive layout — wiki index, ingest form, and page view
Files: src/components/WikiIndexClient.tsx, src/app/ingest/page.tsx, src/app/wiki/[slug]/page.tsx, src/app/wiki/page.tsx
Issue: none

## Description

The app has only 10 responsive breakpoints across all source files. Core pages overflow or look cramped on mobile viewports (<640px). This task adds responsive breakpoints to the three most-used pages.

### WikiIndexClient.tsx (primary target)

The toolbar row (`search + sort + new page + export`) renders as a single horizontal `flex` row that overflows on mobile. Fix:

1. **Wrap the toolbar** — on mobile (`< sm`), stack search on its own row and put sort/new/export below:
   - Change the top toolbar `div` from `flex items-center gap-2` to `flex flex-wrap items-center gap-2`
   - Give the search input `w-full sm:w-auto sm:flex-1` so it takes full width on mobile, then flexes on desktop
   - Group the sort dropdown + new page + export into a `flex gap-2` wrapper that sits below search on mobile

2. **Advanced filters** — the date range `flex items-center gap-3` should become `flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3`

### Ingest page (src/app/ingest/page.tsx)

The header has `flex items-center justify-between` which is fine, but the submit button row (`flex items-center gap-4`) should wrap on small screens:
- Change to `flex flex-wrap items-center gap-3 sm:gap-4`

The tab buttons row (`flex gap-2`) is fine but add overflow handling:
- Change to `flex gap-2 overflow-x-auto`

### Wiki page view (src/app/wiki/[slug]/page.tsx)

The action buttons row (Edit / Delete / links) needs wrapping:
- Check the layout and ensure action buttons wrap naturally on small screens using `flex flex-wrap gap-2`

### Wiki index page (src/app/wiki/page.tsx)

The header row with "Wiki" title and "Activity Log" link:
- Ensure it wraps properly: `flex flex-wrap items-center justify-between gap-2`

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All changes are CSS-only (className modifications), so existing tests should pass. Visually verify by checking that no horizontal overflow occurs at 375px viewport width.
