Title: Fix cross-ref word-boundary matching and deduplicate LintIssue type
Files: src/lib/lint.ts, src/app/lint/page.tsx, src/lib/__tests__/lint.test.ts

Issue: none

## Description

Two code quality issues to fix in one small task:

### 1. Cross-reference word-boundary false positives (`src/lib/lint.ts`)

The `checkMissingCrossRefs` function at ~line 128 uses `contentLower.includes(titleLower)` despite the comment saying "Use word-boundary matching." This causes false positives — a page titled "AI" matches inside words like "certain", "maintain", "said". Even with the 3-char minimum, a title like "map" matches "bitmap".

**Fix:** Replace the `includes()` check with a proper word-boundary regex:

```typescript
const escaped = titleLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`\\b${escaped}\\b`);
if (re.test(contentLower)) {
```

This uses `\b` word boundaries and escapes any regex special characters in the title.

### 2. Duplicate `LintIssue` interface (`src/app/lint/page.tsx`)

Lines 6-10 of `lint/page.tsx` redefine `LintIssue` identically to `src/lib/types.ts`. This is a maintenance risk — if the type changes in one place, the other drifts.

**Fix:** Import `LintIssue` from `@/lib/types` in `lint/page.tsx` and remove the local definition. The `LintResponse` interface can stay local since it's a UI-specific type (extends `LintResult` with an optional `error` field).

Change:
```typescript
import type { LintIssue } from "@/lib/types";

interface LintResponse {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
  error?: string;
}
```

### 3. Add test coverage (`src/lib/__tests__/lint.test.ts`)

Add test(s) verifying word-boundary matching:
- A page titled "AI" should NOT trigger a missing-crossref when another page contains "maintain" or "certain" (but NOT the standalone word "AI")
- A page titled "neural network" SHOULD trigger when another page contains "neural network" as a phrase
- Short titles like "go" inside "algorithm" should not match

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must pass. New tests should verify the word-boundary fix.
