Title: Integrate DiscussionPanel into wiki page view
Files: src/app/wiki/[slug]/page.tsx (modify)
Issue: none

Wire the new `DiscussionPanel` component into the wiki page view so users can
see and participate in discussions about any wiki page.

## What to do

1. Import `DiscussionPanel` from `@/components/DiscussionPanel`.

2. Add it to the page layout between the backlinks section and the RevisionHistory
   section. The placement order should be:
   - Article content (MarkdownRenderer)
   - Source provenance
   - Backlinks ("What links here")
   - **Discussion panel** ← NEW
   - Revision history
   - Action buttons (Edit, Reingest, Delete)

3. Pass `slug` as prop: `<DiscussionPanel slug={slug} />`.

That's it — the DiscussionPanel handles all its own state and API calls internally
(same pattern as RevisionHistory). The integration is minimal.

## Why this is a separate task

The wiki page view is 464 lines — the largest page component. Keeping integration
changes minimal (one import + one JSX element) makes it easy to verify and revert
independently from the component itself.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

After building, the wiki page view should compile with the new component. Visually
(if running `pnpm dev`), any wiki page should show a "Discussion" collapsible
section.
