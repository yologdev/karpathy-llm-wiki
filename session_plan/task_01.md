Title: Decompose lint.ts — extract check functions into lint-checks.ts
Files: src/lib/lint-checks.ts (new), src/lib/lint.ts (modify), src/lib/__tests__/lint.test.ts (modify if needed)
Issue: none

## Description

`lint.ts` is the largest source file at 625 lines. It contains 7 individual check functions (`checkOrphanPages`, `checkStaleIndex`, `checkEmptyPages`, `checkBrokenLinks`, `checkMissingCrossRefs`, `checkContradictions`, `checkMissingConceptPages`) plus helper functions (`getOnDiskSlugs`, `extractCrossRefSlugs`, `buildClusters`, `parseLLMJsonArray`, `parseContradictionResponse`, `parseMissingConceptResponse`, `buildSummary`) plus the main `lint()` orchestrator.

### Plan

1. Create `src/lib/lint-checks.ts` containing:
   - All 7 `check*` functions
   - All helper functions they depend on: `getOnDiskSlugs`, `extractCrossRefSlugs`, `buildClusters`, `parseLLMJsonArray`, `parseContradictionResponse`, `parseMissingConceptResponse`, `buildSummary`
   - The `INFRASTRUCTURE_FILES` constant
   - Re-export `ALL_CHECK_TYPES` from types or define it there

2. Slim `lint.ts` down to:
   - Imports from `lint-checks.ts`
   - `SEVERITY_RANK` constant
   - The main `lint()` export function (the orchestrator)
   - Re-exports for test access

3. Update `src/lib/__tests__/lint.test.ts` if it imports internal helpers directly — the test file imports `parseLLMJsonArray`, `extractCrossRefSlugs`, `buildClusters`, `parseContradictionResponse`, `checkContradictions`, `parseMissingConceptResponse`, `checkMissingConceptPages`, `checkBrokenLinks` from lint.ts. These should continue to work via re-exports from lint.ts, but verify.

### Key constraints
- The existing named exports from `lint.ts` (line 542) must continue to work so tests and any other importers don't break
- `lint-checks.ts` should import from the same dependencies lint.ts currently uses: `wiki.ts`, `llm.ts`, `ingest.ts`, `links.ts`, `types.ts`
- Don't change any function signatures or behavior — pure move refactor

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
All 997 tests must pass, especially the lint test suite.
