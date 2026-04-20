Title: Mobile responsive layout — query page, lint page, and settings page
Files: src/app/query/page.tsx, src/app/lint/page.tsx, src/app/settings/page.tsx, src/components/LintFilterControls.tsx
Issue: none

## Description

Continues the mobile responsiveness push from Task 2, targeting the remaining core pages.

### Query page (src/app/query/page.tsx)

The page already has `flex flex-col lg:flex-row` for the main layout, which is good. But:

1. The heading area (`text-3xl`) should scale down on mobile: add `text-2xl sm:text-3xl`
2. The submit button should be full-width on mobile: `w-full sm:w-auto`
3. The format radio buttons row should wrap: `flex flex-wrap items-center gap-3 sm:gap-4`

### Lint page (src/app/lint/page.tsx)

1. The header row with title + "Run Lint" button: ensure `flex flex-wrap items-center justify-between gap-2`
2. The heading should scale: `text-2xl sm:text-3xl`

### LintFilterControls.tsx

The filter controls (severity toggles, check-type toggles) are rendered horizontally. On mobile they need to wrap:
- Ensure the button group containers use `flex flex-wrap gap-1.5`
- If there's a horizontal overflow risk on the toggle rows, add wrapping

### Settings page (src/app/settings/page.tsx)

1. The page heading should scale: `text-2xl sm:text-3xl`
2. Form inputs should be full-width on mobile (likely already are since they're in a `max-w-3xl` container)
3. Any side-by-side layouts should stack on mobile

### General — all pages

For all modified pages, ensure:
- `px-6` stays for horizontal padding (provides breathing room on mobile)
- Page headings use `text-2xl sm:text-3xl` instead of just `text-3xl`
- Button groups use `flex-wrap` to prevent overflow
- Max-width containers (`max-w-3xl`, `max-w-4xl`) work naturally with mobile since they're max-widths, not fixed widths

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All changes are CSS-only (className modifications), so existing tests should pass.
