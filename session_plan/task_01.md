Title: Add structured `target` field to LintIssue — eliminate brittle message parsing
Files: src/lib/types.ts, src/lib/lint.ts, src/app/lint/page.tsx, src/lib/__tests__/lint.test.ts
Issue: none

## Problem

The lint page extracts target slugs from human-readable lint messages using regexes:

```ts
// src/app/lint/page.tsx lines 43-71
function parseTargetSlug(message: string): string | null {
  const match = message.match(/doesn't link to ([a-z0-9][a-z0-9-]*)\.md$/);
  return match ? match[1] : null;
}
```

This is fragile — if anyone changes the lint message wording, the UI silently loses the ability to fix those issues. It also causes a fix-key collision bug: `${issue.type}:${issue.slug}` collides when multiple issues of the same type affect the same slug (e.g., page A has two broken links).

## Solution

Add an optional `target` field to `LintIssue` in `types.ts`:

```ts
export interface LintIssue {
  type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page" | "contradiction" | "missing-concept-page" | "broken-link";
  slug: string;
  target?: string;  // NEW: structured target slug (for cross-ref, contradiction, broken-link fixes)
  message: string;
  severity: "error" | "warning" | "info";
}
```

### Changes in `src/lib/lint.ts`

For every lint issue that has a target, populate `target`:

1. **`checkBrokenLinks`** (~line 113): Add `target: targetSlug` to the issue object
2. **`checkMissingCrossRefs`** (~line 167): Add `target: other.slug` to the issue object  
3. **`checkContradictions`** (~line 376): Add `target: c.pages[1] ?? c.pages[0]` (the second page in the contradiction pair)
4. **`checkMissingConceptPages`** (~line 510): No target needed (the fix uses `message` to extract the concept name)
5. **Info-level skip messages** (lines 323, 456 with `slug: ""`): Leave as-is, no target needed

### Changes in `src/app/lint/page.tsx`

1. **Delete** the three `parseTargetSlug` / `parseContradictionTargetSlug` / `parseTargetSlugFromBrokenLink` helper functions (lines 40-72)
2. **Replace all `parseXxx(issue.message)` calls** with `issue.target ?? null`
3. **Fix the fix-key**: The key should now be `${issue.type}:${issue.slug}:${issue.target ?? ''}` — this eliminates the collision when multiple broken links or missing cross-refs affect the same source slug but different targets.
4. **Fix the list item `key`**: Use `${issue.type}-${issue.slug}-${issue.target ?? ''}-${i}` where `i` is the index, instead of the message-slice hack.

### Changes in `src/lib/__tests__/lint.test.ts`

Add assertions that the `target` field is populated on broken-link, missing-crossref, and contradiction issues. Grep existing tests for these issue types and add `expect(issue.target).toBe(...)` checks to a representative subset (don't need to update every single test — just enough to lock the contract).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing lint tests must still pass. The `target` field is optional so no backwards compatibility issues.
