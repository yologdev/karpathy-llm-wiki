Title: Dataview query UI on the wiki index page
Files: src/components/DataviewPanel.tsx, src/components/WikiIndexClient.tsx, src/app/wiki/page.tsx (read-only context)
Issue: none

## Description

The dataview query system (`src/lib/dataview.ts`, `POST /api/wiki/dataview`) was built in session ~44 but has no UI — users can only access it through the raw API endpoint. Build a `DataviewPanel` component and integrate it into the wiki index page.

### What to build

**`src/components/DataviewPanel.tsx`** — A collapsible panel with:

1. **Filter builder** — A list of filter rows, each with:
   - A text input for the frontmatter field name (e.g., "tags", "created", "sources")
   - A dropdown for the operator (`eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`, `exists`)
   - A text input for the value (hidden when op is `exists`)
   - A remove button (×) per row
   - An "Add filter" button to add more rows
2. **Sort controls** — A field name input and asc/desc toggle
3. **Limit** — A number input (default 50, max 200)
4. **Run query button** — Calls `POST /api/wiki/dataview` with the constructed query
5. **Results display** — A table showing slug (linked to `/wiki/[slug]`), title, and matching frontmatter fields. Show the total count.
6. **Error display** — Show validation errors from the API inline

Style with Tailwind, matching the existing design language (see `LintFilterControls.tsx`, `BatchIngestForm.tsx` for patterns). Use `"use client"` directive.

### Integration

In `src/components/WikiIndexClient.tsx`, add a toggle/tab or collapsible section labeled "Dataview Query" that renders `<DataviewPanel />`. Place it after the existing search/filter controls but before the page list. Use a simple boolean state `showDataview` to toggle visibility, with a button like "📊 Dataview Query" next to the existing controls.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The component is purely client-side UI calling an existing API route, so no new tests are required — but the build must pass with no type errors. Manually verify the component renders the filter builder, makes API calls, and displays results.
