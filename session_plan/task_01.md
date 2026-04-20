Title: Fix flaky revisions test (Date.now timestamp collision)
Files: src/lib/revisions.ts, src/lib/__tests__/revisions.test.ts
Issue: none

## Problem

The test "multiple writes create multiple revisions" in `revisions.test.ts` (line 171) is failing because `saveRevision` uses `Date.now()` for the revision filename. When three writes happen in rapid succession within the same millisecond, the second `saveRevision` call overwrites the first (same filename), producing 1 revision instead of 2.

## Fix

In `src/lib/revisions.ts`, make `saveRevision` resilient to same-millisecond calls by checking if the target file already exists and bumping the timestamp by 1ms if so. This is the simplest approach that doesn't require injecting a clock.

Specifically, in `saveRevision()`:
1. After computing `const timestamp = Date.now()`, check if `path.join(dir, `${timestamp}.md`)` already exists.
2. If it does, increment timestamp by 1 and re-check, in a small loop (max ~10 iterations).
3. Write to the final unique path.

Alternative (simpler): use a module-level `lastTimestamp` variable to ensure monotonically increasing timestamps:
```typescript
let lastTimestamp = 0;
function uniqueTimestamp(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}
```
This second approach is cleaner — use it.

## Verification

```bash
pnpm test -- src/lib/__tests__/revisions.test.ts
```

Should go from 1 failed to 0 failed. Then run the full suite:

```bash
pnpm build && pnpm lint && pnpm test
```
