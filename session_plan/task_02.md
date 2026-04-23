Title: Extract `loadPageConventions` from `ingest.ts` into shared `schema.ts` module
Files: src/lib/schema.ts, src/lib/ingest.ts, src/lib/query.ts, src/lib/lint-checks.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Description

`loadPageConventions()` reads the "Page conventions" section from SCHEMA.md at runtime. It was written during ingest work and lives in `ingest.ts`, but it's imported by three modules:
- `ingest.ts` (origin)
- `query.ts` (via `import { loadPageConventions } from "./ingest"`)
- `lint-checks.ts` (via `import { loadPageConventions } from "./ingest"`)

This creates a semantic mismatch: schema loading is a shared concern, not an ingest concern. `query.ts` and `lint-checks.ts` importing from `ingest` just to get schema conventions is confusing. A learnings entry explicitly warns about parallel import paths drifting.

### Steps

1. **Create `src/lib/schema.ts`** — Move the `loadPageConventions` function (and its JSDoc, ~40 lines) from `ingest.ts` into a new `schema.ts` module. It needs `import { readFile } from "fs/promises"`, `import path from "path"`, and `import { isEnoent } from "./errors"`. The console.warn tag should change from `[ingest]` to `[schema]`.

2. **Update `src/lib/ingest.ts`** — Remove the `loadPageConventions` function definition. Add `import { loadPageConventions } from "./schema"`. Keep re-exporting it for backward compat: `export { loadPageConventions } from "./schema"`.

3. **Update `src/lib/query.ts`** — Change `import { slugify, loadPageConventions, extractSummary } from "./ingest"` to import `loadPageConventions` from `"./schema"` instead, keeping `slugify` and `extractSummary` from `"./ingest"`.

4. **Update `src/lib/lint-checks.ts`** — Change `import { loadPageConventions } from "./ingest"` to `import { loadPageConventions } from "./schema"`.

5. **Update `src/lib/__tests__/ingest.test.ts`** — The tests for `loadPageConventions` (lines ~1133-1172) should still pass because `ingest.ts` re-exports it. Verify no test changes are needed. If the import in the test file references `loadPageConventions` via the `"../ingest"` import, it will still work via the re-export.

### Why this matters

This is the "parallel write-paths drift" learning applied to imports: when three modules depend on a shared utility, that utility should live in a module named for its concern, not be a hitchhiker in one of its consumers. Future developers reading `query.ts` will wonder "why does query import from ingest?" — moving to `schema.ts` makes the dependency graph self-documenting.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests should pass without modification since `ingest.ts` re-exports `loadPageConventions`.
