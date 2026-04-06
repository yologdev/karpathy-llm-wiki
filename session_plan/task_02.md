Title: LLM-powered contradiction detection in lint
Files: src/lib/lint.ts, src/lib/__tests__/lint.test.ts, src/lib/types.ts
Issue: none

## Problem

The founding vision explicitly calls for "noting where new data contradicts old claims" and lint that finds "contradictions between pages, stale claims that newer sources have superseded." The current lint system is purely structural — it detects orphan pages, stale index entries, empty pages, and missing cross-references. It never reads page content for semantic analysis. This has been listed as "next" in 3 consecutive journal entries but never built.

## Solution

Add a new `checkContradictions()` lint check that uses the LLM to detect contradictions between related wiki pages.

### Design

1. **Identify candidate pairs**: Rather than comparing every page with every other page (O(n²) LLM calls), use cross-references as a signal. Pages that link to each other are likely to discuss overlapping topics and are the most likely to contain contradictions. Group pages by their cross-reference connections.

2. **Build comparison groups**: For each page, collect the pages it links to. Bundle each pair's content and send to the LLM with a focused prompt asking specifically about contradictions, outdated claims, or conflicting data.

3. **Batch efficiently**: Group related pages into clusters of up to 5 pages and send one LLM call per cluster (not per pair). This keeps LLM calls manageable even for a wiki with dozens of pages.

4. **Graceful degradation**: If no LLM key is configured (`hasLLMKey()` returns false), skip contradiction detection entirely and add an info-level issue saying "Contradiction detection skipped — no LLM API key configured."

5. **New issue type**: Add `"contradiction"` to the `LintIssue` type field. Severity: `"warning"`.

### Implementation

In `lint.ts`:
```typescript
async function checkContradictions(diskSlugs: string[]): Promise<LintIssue[]> {
  if (!hasLLMKey()) {
    return [{
      type: 'contradiction',
      slug: '',
      message: 'Contradiction detection skipped — no LLM API key configured',
      severity: 'info',
    }];
  }

  // Build cross-reference graph
  // Group into clusters of related pages
  // For each cluster, call LLM with focused contradiction-detection prompt
  // Parse LLM response into LintIssue objects
}
```

The LLM prompt should be specific:
```
You are a wiki consistency checker. Given the following wiki pages, identify any contradictions, conflicting claims, or cases where one page's information supersedes or conflicts with another's.

For each contradiction found, respond with a JSON array of objects:
[{"pages": ["slug-a", "slug-b"], "description": "Page A says X while Page B says Y"}]

If no contradictions are found, respond with an empty array: []
```

### In types.ts

Add `"contradiction"` to the `LintIssue.type` union type.

### Tests

Add tests in `lint.test.ts`:
- Test that contradiction detection is skipped gracefully when no LLM key is set
- Test with mocked LLM that returns contradictions → issues are created correctly
- Test with mocked LLM that returns no contradictions → no issues
- Test with mocked LLM that returns malformed response → graceful handling (no crash)

Mock `callLLM` the same way other test files do (vi.mock).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must still pass. New lint tests should cover the contradiction detection paths.
