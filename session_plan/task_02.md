Title: Silence expected ENOENT warnings in test output
Files: src/lib/wiki.ts, src/lib/config.ts, src/lib/query-history.ts
Issue: none

## Problem

Running `pnpm test` produces ~370 lines of stderr noise like:
```
[wiki] readWikiPage failed for "does-not-exist": Error: ENOENT: no such file or directory...
```

These are expected — tests deliberately read nonexistent pages. But the `console.warn` calls fire unconditionally, making CI output hard to scan and obscuring real failures.

## Fix

Suppress the ENOENT-specific console.warn calls when the error is an expected "file not found". The approach:

In `src/lib/wiki.ts`, in the catch blocks at lines ~157 and ~236 (and potentially ~133), check if the error is ENOENT before logging. ENOENT in `readWikiPage` is a normal code path (page doesn't exist), not an unexpected error — it should not warn. The function already returns `null` for missing pages, which is its documented contract.

Specifically:
1. **`readWikiPage` (line ~157)** — Only `console.warn` for non-ENOENT errors. ENOENT is expected and the function handles it by returning `null`. Import `isEnoent` from `./errors` (it already exists).
2. **`listWikiPages` (line ~236)** — Same pattern: only warn for non-ENOENT errors on index.md read.
3. **`readWikiPage` slug validation (line ~133)** — This one is a genuine warning (bad slug) — keep it.

Also check `src/lib/config.ts` and `src/lib/query-history.ts` for similar noisy ENOENT warnings during tests — apply the same pattern if found.

## Key Constraint

Do NOT add a `NODE_ENV` or `TEST` check. The fix should be semantic: ENOENT on a read that returns null/default is not warn-worthy regardless of environment. Only unexpected errors should warn.

## Verification

```bash
pnpm test 2>&1 | grep -c "ENOENT"
```

Should be 0 (or very close). Then:

```bash
pnpm build && pnpm lint && pnpm test
```

All tests must still pass (964 tests, 0 failures after task_01 fix).
