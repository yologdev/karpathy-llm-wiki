Title: Fix saveAnswerToWiki missing frontmatter + consolidate magic numbers + fix CLI lint --fix exit code
Files: src/lib/query.ts, src/lib/constants.ts, src/lib/llm.ts, src/cli.ts
Issue: none

## Three small fixes in one task (all under 5 files)

### Fix 1: saveAnswerToWiki missing frontmatter
In `src/lib/query.ts`, `saveAnswerToWiki()` builds page content but does NOT wrap
it in YAML frontmatter the way `ingest()` does. This means saved query answers lack
`created`, `updated`, `tags`, and `source` metadata, causing:
- Inconsistency in wiki index filtering (date range, tags)
- Lint may flag these pages as having issues

**Fix:** Import `serializeFrontmatter` from `../frontmatter` and wrap the content
before passing to `writeWikiPageWithSideEffects`. Frontmatter should include:
```yaml
created: <ISO date>
updated: <ISO date>
source: query
tags: [query-answer]
```

Also update the test file `src/lib/__tests__/query.test.ts` to verify frontmatter
is present in saved answers. (Check the existing test first — it may already check
for file content.)

### Fix 2: Consolidate magic numbers into constants.ts
Add these to `src/lib/constants.ts`:
- `LLM_MAX_OUTPUT_TOKENS = 4096` — used in `callLLM` and `callLLMStream`
- `GRAPH_CANVAS_HEIGHT = 560` — used in graph page (but DON'T touch graph page,
  that's task_01's territory — just add the constant; graph page can reference
  it in a future task)

Then update `src/lib/llm.ts` to import and use `LLM_MAX_OUTPUT_TOKENS` instead of
the hardcoded `4096` in both `callLLM` (line ~279) and `callLLMStream` (line ~324).

### Fix 3: CLI lint --fix exit code
In `src/cli.ts` around line 183-186, the `--fix` path never calls `process.exit(1)`
when `failed > 0`. Fix this:

```typescript
if (!fix) {
  process.exit(1);
} else if (failed > 0) {
  process.exit(1);
}
```

Update `src/lib/__tests__/cli.test.ts` if there's a test for this path.

### Verification
- `pnpm build && pnpm lint && pnpm test`
- Manually verify the constants are imported correctly (no circular deps)
