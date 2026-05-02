Title: Contributor profiles UI page
Files: src/app/wiki/contributors/page.tsx, src/app/wiki/contributors/loading.tsx, src/app/wiki/contributors/error.tsx, src/app/wiki/contributors/[handle]/page.tsx
Issue: none

## Description

Phase 2 has contributor profile API routes (`/api/contributors` and `/api/contributors/[handle]`) and inline `ContributorBadge` components, but there's no browsable page where users can see all contributors or drill into a specific contributor's profile.

Build two pages:

### 1. `/wiki/contributors` — Contributors index

A server component page that:
- Fetches all contributors via `listContributors()` from `@/lib/contributors`
- Renders a table/list with columns: handle (with trust dot), edit count, pages edited, comment count, trust score, last seen
- Each row links to `/wiki/contributors/[handle]`
- Header: "Contributors" with a brief description
- Sort by trust score or edit count (already sorted by editCount from the API)

### 2. `/wiki/contributors/[handle]` — Single contributor detail

A server component page that:
- Fetches the contributor profile via `buildContributorProfile(handle)` 
- Shows: handle, trust score (with visual indicator), edit count, pages edited count, comment count, threads created, first seen, last seen
- If profile has 0 activity, show a not-found style message
- Keep it simple — just the profile data for now

### Also create:
- `loading.tsx` for the index page (skeleton with a heading and loading indicator)
- `error.tsx` for the index page (standard error boundary)

### Navigation
Add a "👥 Contributors" link on the wiki index page (`src/app/wiki/page.tsx`) next to the existing "📋 Activity Log" link.

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
