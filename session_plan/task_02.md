Title: Dedicated test suite for schema.ts
Files: src/lib/__tests__/schema.test.ts
Issue: none

## Description

`schema.ts` (86 lines) exports `loadPageConventions` and `loadPageTemplates`. These are used by the ingest and lint pipelines but have no dedicated test file. Add focused unit tests.

### Functions to test

1. **`loadPageConventions(schemaPath?)`** — Test:
   - Returns the `## Page conventions` section from a valid SCHEMA.md
   - Returns `""` when SCHEMA.md doesn't exist
   - Returns `""` when the heading is not found
   - Correctly extracts content up to the next `## ` heading
   - Extracts last section correctly when there's no following `## ` heading

2. **`loadPageTemplates(schemaPath?)`** — Test:
   - Returns the `## Page templates` section from a valid SCHEMA.md
   - Returns `""` when SCHEMA.md doesn't exist
   - Returns `""` when the heading is not found
   - Handles SCHEMA.md with only templates (no conventions)

### Implementation notes

- Create `src/lib/__tests__/schema.test.ts`
- Write temporary SCHEMA.md files in temp directories using `fs.mkdtemp`
- Pass explicit `schemaPath` to avoid depending on `process.cwd()`
- Use real content snippets similar to the actual `SCHEMA.md` format
- Target: ~10 test cases
- Verify: `pnpm build && pnpm lint && pnpm test`
