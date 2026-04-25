Title: Migrate lib modules from console.warn/error to structured logger
Files: src/lib/logger.ts (import only), src/lib/wiki.ts, src/lib/config.ts, src/lib/fetch.ts, src/lib/search.ts, plus other lib modules
Issue: none

## Description

Migrate all `console.warn` and `console.error` calls in `src/lib/*.ts` (non-test files) to use the structured logger created in Task 01.

### Scope

The full list of files with console.warn/error (from assessment):

- `src/lib/bm25.ts` (1 call)
- `src/lib/config.ts` (2 calls)
- `src/lib/embeddings.ts` (2 calls)
- `src/lib/fetch.ts` (6 calls)
- `src/lib/lifecycle.ts` (2 calls)
- `src/lib/lint-checks.ts` (4 calls)
- `src/lib/llm.ts` (1 call)
- `src/lib/query-history.ts` (1 call)
- `src/lib/query.ts` (2 calls)
- `src/lib/revisions.ts` (3 calls)
- `src/lib/schema.ts` (1 call)
- `src/lib/search.ts` (5 calls)
- `src/lib/wiki-log.ts` (1 call)
- `src/lib/wiki.ts` (5 calls)

### Migration pattern

For each call, replace:
```ts
console.warn("[tag] message:", err);
```
with:
```ts
import { logger } from "./logger";
// ...
logger.warn("tag", "message:", err);
```

The tag is already present in most calls as a `[bracket]` prefix — extract it and pass as the first argument. Keep the same log level (warn→warn, error→error).

**Important**: This is a mechanical transformation. Do NOT change the semantics of any error handling. Do NOT suppress or promote any log level. The output should be identical when logging is enabled.

### Note on test files

Do NOT touch any test files (`src/lib/__tests__/*.test.ts`). Tests that spy on `console.warn` will need updating, but that's a separate concern. The tests that do `vi.spyOn(console, 'warn')` should still pass because the logger delegates to `console.warn` internally — but if any tests break, update the spy to target the logger instead.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

After migration, `grep -rn 'console\.\(warn\|error\)' src/lib/*.ts | grep -v __tests__ | grep -v logger.ts` should return zero results (or only deliberate exceptions in logger.ts itself).
