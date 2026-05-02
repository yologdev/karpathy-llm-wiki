Title: Add revert tracking to contributor trust scores
Files: src/lib/types.ts, src/lib/contributors.ts, src/lib/__tests__/contributors.test.ts
Issue: none

## Context

The yopedia-concept.md says trust scores should "accrue over time based on revert
rates, contradiction rates, and external citation." Right now the trust score is
a placeholder: `min(1, (editCount + commentCount) / 50)`. The ContributorProfile
type even has a comment acknowledging this is a placeholder.

Revert detection is the most tractable improvement: when a page has multiple
revisions and a later revision is substantially shorter than a previous one (or
the page was deleted and recreated), that's a signal of a revert. We can detect
this from the existing revision data without any new infrastructure.

## Implementation

### 1. Add `revertCount` to ContributorProfile (types.ts)

Add to the `ContributorProfile` interface:
```typescript
/** Number of revisions where this author's content was subsequently reverted
 *  (i.e., a later revision by a different author substantially reduced content). */
revertCount: number;
```

### 2. Detect reverts in contributors.ts

Add a `detectReverts` function that scans revisions for a pattern:
- For each page, list revisions in chronological order
- A "revert" is when revision N+1 by author B reduces the content size of
  revision N by author A by more than 50% (a substantial rollback)
- When detected, increment the revert count for author A (whose content was reverted)

This is a heuristic — not perfect, but it's the simplest meaningful signal.
The concept doc says "plain JSON, not on-chain" so heuristics are fine.

### 3. Update trust score formula

Change from:
```
min(1, (editCount + commentCount) / 50)
```
To:
```
min(1, (editCount + commentCount) / 50) * (1 - min(0.5, revertCount * 0.1))
```

This means each revert reduces trust by 10%, capped at 50% reduction.
A contributor with 5+ reverts loses half their trust score.

### 4. Update tests (contributors.test.ts)

- Add test: contributor with no reverts gets full trust score
- Add test: contributor whose content was reverted gets reduced trust score
- Add test: revert detection only triggers when different author reverts
- Add test: revert detection requires >50% size reduction (small edits don't count)

### 5. Wire through to profile display

The `ContributorBadge` and contributor detail page already display `trustScore` —
they'll automatically reflect the new formula. Add `revertCount` to the
contributor detail page display.

## Verification

- `pnpm build && pnpm lint && pnpm test` must pass
- New tests specifically cover revert detection logic
- Existing contributor tests still pass (they have no reverts, so scores shouldn't change)
