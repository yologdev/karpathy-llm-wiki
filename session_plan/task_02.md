Title: Page revision history — API route and UI
Files: src/app/api/wiki/[slug]/revisions/route.ts, src/app/wiki/[slug]/page.tsx, src/lib/lifecycle.ts
Issue: none

## Description

Expose revision history through an API and surface it in the wiki page view so users can see what changed and revert to previous versions.

### API Route: `GET /api/wiki/[slug]/revisions`

Create `src/app/api/wiki/[slug]/revisions/route.ts`:

```typescript
// GET /api/wiki/[slug]/revisions
// Returns: { revisions: Revision[] }
// 404 if the page doesn't exist
// 200 with empty array if page exists but has no revisions
```

```typescript
// GET /api/wiki/[slug]/revisions?timestamp=1713150000000
// Returns: { content: string, revision: Revision }
// 404 if revision not found
```

```typescript
// POST /api/wiki/[slug]/revisions  { action: "revert", timestamp: 1713150000000 }
// Reverts the page to the given revision's content.
// Uses writeWikiPageWithSideEffects so index/cross-refs/log stay consistent.
// Returns the WritePageResult.
```

### UI Changes: `src/app/wiki/[slug]/page.tsx`

Add a "History" section to the wiki page view, below the backlinks section:

1. Add a collapsible "History" section with a clock icon
2. When expanded, fetch `GET /api/wiki/[slug]/revisions` client-side
3. Show a list of revisions with relative timestamps (use `formatRelativeTime`)
4. Each revision has a "View" button that shows the content in a modal or inline diff
5. Each revision has a "Revert" button with confirmation dialog

Since the page is currently a server component, extract the history section into a small client component (`RevisionHistory`) rendered at the bottom of the page. Pass only the `slug` prop — it fetches its own data.

### Lifecycle Integration: `src/lib/lifecycle.ts`

In `deleteWikiPage`, call `deleteRevisions(slug)` to clean up revisions when a page is deleted. Import from `../lib/revisions`.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All existing tests must pass. The new API route should handle error cases gracefully.
