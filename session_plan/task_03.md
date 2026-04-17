Title: Add sort and date-range filtering to wiki index
Files: src/components/WikiIndexClient.tsx, src/lib/format.ts, src/lib/__tests__/format.test.ts
Issue: none

## Description

The wiki index currently supports text search and tag filtering, but there's no way to sort pages or filter by date — both are table-stakes for a knowledge base. The founding vision mentions Dataview-style frontmatter queries; this is the first step: making the existing frontmatter-derived metadata (updated date, source count) actionable in the browse UI.

### Changes

**1. Add sort options to `WikiIndexClient.tsx`:**

Add a sort dropdown with options:
- **Recently updated** (default) — sort by `updated` field descending, nulls last
- **Title A–Z** — alphabetical by title
- **Title Z–A** — reverse alphabetical
- **Most sources** — sort by `sourceCount` descending

Implementation: add a `sortBy` state, apply sorting in the `filtered` useMemo after the existing search/tag filter logic. Keep the dropdown compact — a `<select>` element styled consistently with the existing search input.

**2. Add date range filter to `WikiIndexClient.tsx`:**

Add two optional date inputs (from/to) that filter pages by their `updated` field:
- Only show pages updated within the selected range
- Either end can be left empty (open-ended range)
- Use native `<input type="date">` elements for simplicity
- Place them in a collapsible "Advanced filters" row below the tag row to avoid cluttering the default view

Implementation: add `dateFrom` and `dateTo` state strings, filter in the `filtered` useMemo by comparing `page.updated` against the range.

**3. Add `parseISODate` helper to `src/lib/format.ts`:**

Add a simple date-string comparison helper that normalizes ISO date strings for comparison (handles both `YYYY-MM-DD` and full ISO timestamps). This keeps date parsing logic out of the component. Add tests in `src/lib/__tests__/format.test.ts`.

**4. Update clear-filters logic:**

The existing `clearFilters` function should also reset `sortBy` to default and clear date range inputs. Update the `hasActiveFilters` check to include non-default sort and date filters.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Visual verification: wiki index should show sort dropdown and date filters. Sorting should reorder the page list. Date filtering should narrow results. All existing search + tag filtering should continue to work.
