Title: Unit tests for fixKey and ingest validation logic
Files: src/lib/__tests__/ingest-helpers.test.ts, src/lib/__tests__/lint-helpers.test.ts, src/hooks/useIngest.ts (read-only), src/hooks/useLint.ts (read-only)
Issue: none

## Description

After tasks 01 and 02 extract hooks, write unit tests for the pure functions that were extracted alongside them. This starts closing the "zero component-layer tests" gap identified in the assessment — but targets the testable pure logic rather than requiring React testing infrastructure.

### Test 1: `src/lib/__tests__/lint-helpers.test.ts`

Test the `fixKey` function exported from `src/hooks/useLint.ts`. This function computes tracking keys for lint fix operations and contains issue-type-specific branching logic.

Test cases:
- `fixKey` for `orphan` issue → `"orphan:<slug>"`
- `fixKey` for `stale-index` issue → `"stale-index:<slug>"`
- `fixKey` for `empty-page` issue → `"empty-page:<slug>"`
- `fixKey` for `missing-crossref` with target → `"missing-crossref:<slug>:<target>"`
- `fixKey` for `missing-crossref` without target → `"missing-crossref:<slug>"`
- `fixKey` for `contradiction` with target → `"contradiction:<slug>:<target>"`
- `fixKey` for `broken-link` with target → `"broken-link:<slug>:<target>"`
- `fixKey` for `missing-concept-page` → `"missing-concept-page:<message>"`

### Test 2: `src/lib/__tests__/ingest-helpers.test.ts`

Extract the URL validation logic from `handleDirectIngest` in `useIngest.ts` into a standalone pure function `validateIngestInput(mode, title, content, url): string | null` (returns error message or null). Export it from the hook file. Then test it:

Test cases:
- URL mode with empty string → error "Please enter a URL"
- URL mode with invalid URL → error about valid URL
- URL mode with valid URL → null (no error)
- Text mode with empty title → error "Please enter a title"
- Text mode with empty content → error "Please enter some content"
- Text mode with both filled → null (no error)
- Whitespace-only inputs treated as empty

### Implementation notes

- Import the pure functions directly — no React rendering needed
- These tests run in the existing `vitest` + `node` environment
- If `fixKey` is not exported from the hook file after task 02, adjust the import path

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

New tests should pass alongside all existing 1,180 tests.
