Title: Add missing error boundaries and route-level loading skeletons
Files: src/app/raw/[slug]/error.tsx (create), src/app/wiki/error.tsx (create), src/app/wiki/[slug]/edit/error.tsx (create), src/app/ingest/loading.tsx (create), src/app/lint/loading.tsx (create)
Issue: none

## Description

Three routes are missing error boundaries, falling through to parent or global error pages instead of showing contextual recovery UI. Additionally, only the root `loading.tsx` exists — navigating to slow pages (ingest, lint) shows a generic loading spinner instead of a page-specific skeleton.

### Error boundaries to create (3 files)

Follow the exact pattern from existing error boundaries (e.g., `src/app/ingest/error.tsx`):

1. **`src/app/raw/[slug]/error.tsx`**
   - Title: "Source view error"
   - Description: "Something went wrong while loading this source."
   - backHref: "/raw"
   - backLabel: "← Sources"

2. **`src/app/wiki/error.tsx`**
   - Title: "Wiki error"
   - Description: "Something went wrong while loading the wiki."
   - backHref: "/"
   - backLabel: "← Home"

3. **`src/app/wiki/[slug]/edit/error.tsx`**
   - Title: "Edit error"
   - Description: "Something went wrong while editing this page."
   - backHref: "/wiki"
   - backLabel: "← Wiki"

### Loading skeletons to create (2 files)

Create route-level loading.tsx files for the two slowest pages (ingest involves URL fetching, lint runs multiple LLM checks). These should render lightweight skeleton UI specific to the page layout:

4. **`src/app/ingest/loading.tsx`** — Show a simple "Loading ingest…" skeleton with a placeholder for the form area.

5. **`src/app/lint/loading.tsx`** — Show a "Running lint checks…" skeleton with placeholder cards.

Each loading skeleton should use the same styling patterns as the root `src/app/loading.tsx` but with page-appropriate content hints.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All files are new — no existing code is modified.
