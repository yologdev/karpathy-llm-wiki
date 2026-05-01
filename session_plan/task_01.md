Title: Fix CLI test type drift (7 tsc errors)
Files: src/lib/__tests__/cli.test.ts
Issue: none

Fix all 7 TypeScript errors in `cli.test.ts` that `tsc --noEmit` reports. These are the only type errors in the entire codebase. Three distinct issues:

1. **`process.exit` mock typing** (line ~160): The `vi.spyOn(process, "exit")` mock has incompatible types. Fix by casting the mock implementation more precisely — use `as unknown as () => never` or type the spy correctly.

2. **`IndexEntry` mock objects include `content` property** (lines 176, 177, 213-215): `IndexEntry` doesn't have a `content` field — the mock objects were likely written when `listWikiPages` returned `WikiPage[]`. Since `runList` calls `listWikiPages` which returns `WikiPage[]` (not `IndexEntry[]`), check what the mock is actually typed as and ensure the mock data matches the real return type. If `listWikiPages` returns `WikiPage[]`, the mock data is correct but may need a type assertion. If the import type says `IndexEntry`, remove `content`.

3. **`FixResult` mock missing `success` property** (line ~317): The `fixLintIssue` mock returns `{ message, slug }` but `FixResult` requires `{ success, slug, message }`. Add `success: true` to the mock return value.

Verification:
```sh
npx tsc --noEmit 2>&1 | grep -c "error TS"  # Should be 0
pnpm test -- --run src/lib/__tests__/cli.test.ts
pnpm build && pnpm lint && pnpm test
```
