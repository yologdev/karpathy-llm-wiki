Title: Lint UI page — browse and understand wiki health
Files: src/app/lint/page.tsx
Issue: none

## Description

Build the lint UI page at `/lint` so users can run the lint check and see results visually. This completes the lint operation end-to-end (task_01 provides the backend).

### What to build

**`src/app/lint/page.tsx`** — Client component ("use client") with:

1. **Run Lint button** — POSTs to `/api/lint`, shows loading state
2. **Results display** — Shows each `LintIssue` with:
   - Color-coded severity badges (red for error, yellow for warning, blue for info)
   - Issue type as a tag/pill
   - The affected slug as a link to `/wiki/[slug]`
   - The issue message
3. **Summary section** — Shows `result.summary` (e.g., "Found 3 issues across 12 pages") and `checkedAt` timestamp
4. **Empty state** — When lint returns 0 issues, show a green success message ("Wiki is healthy! No issues found.")
5. **Error handling** — If the API call fails, show an error message with retry option

### Style guidelines
- Follow the same Tailwind patterns as `/ingest` and `/query` pages (dark theme, rounded cards, consistent spacing)
- Use the same page layout structure: heading, description, main content area
- Include a back link to the home page

### Verification
```
pnpm build && pnpm lint && pnpm test
```
