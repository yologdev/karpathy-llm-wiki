Title: Add missing route-level error boundaries
Files: src/app/lint/error.tsx, src/app/wiki/graph/error.tsx, src/app/wiki/new/error.tsx, src/app/wiki/log/error.tsx, src/app/raw/error.tsx
Issue: none

## Problem

Several routes lack route-level `error.tsx` files, so errors fall through to the
global `src/app/error.tsx` boundary, losing contextual navigation (back links to
relevant sections).

Currently missing:
- `/lint` → no `src/app/lint/error.tsx`
- `/wiki/graph` → no `src/app/wiki/graph/error.tsx`
- `/wiki/new` → no `src/app/wiki/new/error.tsx`
- `/wiki/log` → no `src/app/wiki/log/error.tsx`
- `/raw` and `/raw/[slug]` → no error boundaries (but `/raw/[slug]` can inherit from `/raw`)

## Implementation

Create 5 error boundary files following the established pattern from
`src/app/wiki/[slug]/error.tsx`:

1. **`src/app/lint/error.tsx`**
   - title: "Lint error"
   - description: "Something went wrong running lint checks."
   - backHref: "/" / backLabel: "← Home"

2. **`src/app/wiki/graph/error.tsx`**
   - title: "Graph error"
   - description: "Something went wrong loading the wiki graph."
   - backHref: "/wiki" / backLabel: "← Back to wiki"

3. **`src/app/wiki/new/error.tsx`**
   - title: "New page error"
   - description: "Something went wrong creating a new wiki page."
   - backHref: "/wiki" / backLabel: "← Back to wiki"

4. **`src/app/wiki/log/error.tsx`**
   - title: "Log error"
   - description: "Something went wrong loading the activity log."
   - backHref: "/wiki" / backLabel: "← Back to wiki"

5. **`src/app/raw/error.tsx`**
   - title: "Source error"
   - description: "Something went wrong loading raw sources."
   - backHref: "/" / backLabel: "← Home"

Each file is ~22 lines, uses `"use client"`, imports `PageError` from
`@/components/ErrorBoundary`, and follows the exact same pattern.

### Verification
- `pnpm build && pnpm lint && pnpm test`
- Verify all 5 new files are included in the build output
