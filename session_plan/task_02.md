Title: Extract lifecycle pipeline from wiki.ts into lifecycle.ts
Files: src/lib/lifecycle.ts, src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Problem

Gap #11 from assessment: `wiki.ts` is a 726-line God module with 20+ exports handling page I/O, index management, logging, cross-referencing, embedding orchestration, and the delete/write lifecycle pipeline. The learnings file explicitly flags that "Delete is a write-path too — lifecycle ops, not just writes" and the deep fix (unified lifecycle op) was deferred.

## Implementation

### 1. Create `src/lib/lifecycle.ts`

Extract the following from `wiki.ts` into a new `lifecycle.ts` module:

**Types to move:**
- `PageLifecycleOp` (the internal discriminated union — currently not exported)
- `LifecycleOpResult` (currently not exported)
- `WritePageOptions` (exported interface)
- `WritePageResult` (exported interface)
- `DeletePageResult` (exported interface)

**Functions to move:**
- `stripBacklinksTo()` (private helper)
- `runPageLifecycleOp()` (private, becomes the internal engine)
- `deleteWikiPage()` (exported)
- `writeWikiPageWithSideEffects()` (exported)

**Imports needed by lifecycle.ts from wiki.ts:**
- `validateSlug`, `writeWikiPage`, `readWikiPage`, `listWikiPages`, `updateIndex`, `findRelatedPages`, `updateRelatedPages`, `appendToLog`, `getWikiDir`
- `upsertEmbedding`, `removeEmbedding` from `./embeddings`
- `LogOperation` type from `./wiki`

### 2. Update `src/lib/wiki.ts`

- Remove the extracted code (~170 lines)
- Re-export the public types and functions from `lifecycle.ts` for backward compatibility:
  ```typescript
  export { writeWikiPageWithSideEffects, deleteWikiPage } from "./lifecycle";
  export type { WritePageOptions, WritePageResult, DeletePageResult } from "./lifecycle";
  ```
- `wiki.ts` should drop to ~560 lines

### 3. Update imports in consumers

Check all files that import `writeWikiPageWithSideEffects`, `deleteWikiPage`, `WritePageOptions`, `WritePageResult`, or `DeletePageResult`. They currently import from `./wiki` — the re-exports ensure they keep working without changes. No consumer file modifications needed.

### 4. Tests

The existing tests in `src/lib/__tests__/wiki.test.ts` import from `../wiki` and should continue to pass unchanged thanks to the re-exports. Run the full test suite to verify no breakage. No new tests needed — this is a pure refactor.

### Verify

```sh
pnpm build && pnpm lint && pnpm test
```

After extraction, `wiki.ts` should be ~560 lines and `lifecycle.ts` should be ~170 lines. The module boundary is clean: lifecycle.ts depends on wiki.ts primitives, not vice versa.
