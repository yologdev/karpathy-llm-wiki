Title: Extract shared relative-time formatter and fix citations.ts O(n) lookup
Files: src/lib/format.ts, src/lib/__tests__/format.test.ts, src/app/query/page.tsx, src/components/WikiIndexClient.tsx, src/app/raw/page.tsx, src/lib/citations.ts

Issue: none

## Problem 1: Three duplicate relative-time formatters

Three near-identical functions exist:
- `src/app/query/page.tsx:30` — `relativeTime(iso: string): string`
- `src/components/WikiIndexClient.tsx:14` — `formatRelative(iso: string): string | null`
- `src/app/raw/page.tsx:16` — `formatRelativeDate(iso: string): string`

All compute elapsed time from an ISO timestamp and return a human-friendly string like "2h ago", "3d ago". They differ only in minor threshold choices and null-vs-empty-string handling.

## Fix 1

Create `src/lib/format.ts` with a single `formatRelativeTime(iso: string): string` function that all three consumers import. Use the most complete threshold set (minutes, hours, days, months, years). Write a small test file `src/lib/__tests__/format.test.ts` covering each threshold bucket.

Then replace the local functions in all three files with an import from `src/lib/format.ts`. Remove the local function definitions.

NOTE: This touches 5 files (format.ts, format.test.ts, query/page.tsx, WikiIndexClient.tsx, raw/page.tsx) plus citations.ts = 6, but the citations fix is a one-liner. If needed, drop citations.ts from this task. However the limit is "at most 5 files to create/modify", so handle it as follows:
- Create: `src/lib/format.ts`, `src/lib/__tests__/format.test.ts` (2 new files)
- Modify: `src/app/query/page.tsx`, `src/components/WikiIndexClient.tsx`, `src/app/raw/page.tsx` (3 existing files)
- That's 5 files total.

## Problem 2 (separate — move to task_03 if needed)

`citations.ts:15` — `availableSlugs.includes(slug)` is O(n) per regex match. Should use a `Set`.

This is a one-line fix in `citations.ts`. Handle it separately if the 5-file limit is a concern.

Verify: `pnpm build && pnpm lint && pnpm test`
