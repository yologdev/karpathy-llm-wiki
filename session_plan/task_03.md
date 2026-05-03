Title: Add scoped search tests for query pipeline and API routes
Files: src/lib/__tests__/query.test.ts, src/lib/__tests__/query-search.test.ts
Issue: none (Phase 4 completion — scoped search tests)

## Context

Tasks 01 and 02 add scope filtering to search and query. This task adds
integration-level tests to verify the scoped query pipeline works end-to-end.

## What to build

### 1. Tests in `src/lib/__tests__/query-search.test.ts`

Add a test group "scoped search":
- `selectPagesForQuery` with `scopeSlugs` restricts returned slugs to the scope
- `selectPagesForQuery` without `scopeSlugs` returns all matching (existing behavior)
- When scopeSlugs filters out all entries, returns empty array

Check what test infrastructure already exists in the file — use the same
tmpDir/DATA_DIR pattern for creating test wiki pages.

### 2. Tests in `src/lib/__tests__/query.test.ts` (if it exists)

If there's an existing query test file, add tests for:
- `query(question, "prose", "agent:test-agent")` with a registered agent
  returns only pages from that agent's scope
- `query(question, "prose", "agent:nonexistent")` returns an error/empty message

If the file doesn't exist or query tests require LLM mocking that's too complex,
skip and document why.

### 3. Check for any missed edge cases

- What happens when an agent has no pages? (empty identityPages etc.)
- What happens when scope pages don't exist on disk? (agent references
  deleted pages)

## Verification

```sh
pnpm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|scoped)"
```

All tests pass. New scoped search tests appear in output.
