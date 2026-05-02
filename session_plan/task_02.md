Title: Contributor profiles API route and UI badges
Files: src/app/api/contributors/route.ts, src/app/api/contributors/[handle]/route.ts, src/app/wiki/[slug]/page.tsx, src/components/ContributorBadge.tsx
Issue: none

## What

Wire the contributor profiles from task_01 into the API and display contributor badges in the wiki page view. This completes the Phase 2 roadmap items "Contributor profiles" and "Contributor badges in UI."

## API routes

### `GET /api/contributors`
- Calls `listContributors()` from `src/lib/contributors.ts`
- Returns JSON array of `ContributorProfile` objects
- Query param `?handle=alice` to get a single profile (convenience)

### `GET /api/contributors/[handle]`
- Calls `buildContributorProfile(handle)` 
- Returns single `ContributorProfile` JSON
- 404 if handle has zero activity (editCount + commentCount === 0)

Both routes go in `src/app/api/contributors/`.

## ContributorBadge component — `src/components/ContributorBadge.tsx`

A small inline component that shows an author name with visual trust indicator:

```tsx
interface ContributorBadgeProps {
  handle: string;
  editCount?: number;
  trustScore?: number;
}
```

Display:
- Author handle as text
- A small colored dot next to the name indicating trust level:
  - Green (≥0.7), Yellow (≥0.3), Gray (<0.3)
- Tooltip or title text: "X edits · trust: Y"
- Keep it simple — a `<span>` with inline styling, no heavy dependencies

## Integration in wiki page view

In `src/app/wiki/[slug]/page.tsx`, the authors list currently renders as plain text badges. Replace with `<ContributorBadge>` components. Since contributor data requires an API call, fetch contributor profiles client-side for the page's `authors[]` list and render badges with trust indicators.

Keep it lightweight — if the contributor API call fails, fall back to showing plain author names (current behavior).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```
