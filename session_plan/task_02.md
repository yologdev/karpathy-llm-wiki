Title: Decompose WikiIndexClient into focused sub-components
Files: src/components/WikiIndexToolbar.tsx (create), src/components/WikiPageCard.tsx (create), src/components/WikiIndexClient.tsx (modify)
Issue: none

## Description

`WikiIndexClient.tsx` is 364 lines — the largest component in the project and a P1 decomposition target from the status report. It mixes three distinct concerns:

1. **Toolbar** — search input, sort dropdown, new page link, export button, dataview toggle (lines 153–203)
2. **Filter controls** — tag row, advanced date filters, clear button (lines 205–310)
3. **Page list** — rendering filtered results as cards (lines 312–361)

### Extraction plan

**`src/components/WikiIndexToolbar.tsx`** (~80 lines)
Extract the toolbar (search + sort + action buttons) and the tag filter row + advanced date filters into a single `WikiIndexToolbar` component. Props:
- `searchTerm`, `onSearchChange` 
- `sortBy`, `onSortChange`
- `allTags`, `activeTags`, `onToggleTag`
- `dateFrom`, `dateTo`, `onDateFromChange`, `onDateToChange`
- `showAdvanced`, `onToggleAdvanced`
- `showDataview`, `onToggleDataview`
- `hasActiveFilters`, `onClearFilters`
- `exporting`, `onExport`
- `filteredCount`, `totalCount`

**`src/components/WikiPageCard.tsx`** (~50 lines)
Extract the individual page list item (the `<li>` with Link, title, summary, tags, metadata) into a `WikiPageCard` component. Props:
- `page: IndexEntry`

**`src/components/WikiIndexClient.tsx`** (shrinks from 364 → ~120 lines)
Retains all state and filtering/sorting logic (the `useMemo` computations), delegates rendering to the two extracted components plus the existing `DataviewPanel`.

### Key constraints

- Do NOT change the UI appearance — this is a pure refactor.
- Export the new components as named exports for potential reuse.
- Keep the `SortOption` type in `WikiIndexClient.tsx` (or move to a shared types location) so both toolbar and parent can reference it.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

This is a pure refactor — no behavior change. Build pass confirms types are correct and imports resolve.
