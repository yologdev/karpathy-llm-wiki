Title: Dedicated test suites for html-parse and url-safety modules
Files: src/lib/__tests__/html-parse.test.ts (new), src/lib/__tests__/url-safety.test.ts (new), src/lib/__tests__/fetch.test.ts
Issue: none

Two modules were extracted from `fetch.ts` in session ~56 but their tests still live in `fetch.test.ts`, importing through re-exports. Create dedicated test files that import directly from the source modules.

**Task:**

1. **Create `src/lib/__tests__/html-parse.test.ts`:**
   - Move all `stripHtml`, `htmlToMarkdown`, `extractTitle`, and `extractWithReadability` tests from `fetch.test.ts` into this new file
   - Change imports from `"../fetch"` to `"../html-parse"`
   - Add 2-3 new edge case tests for `htmlToMarkdown` (nested lists, code blocks, tables) to justify the new file beyond just a move

2. **Create `src/lib/__tests__/url-safety.test.ts`:**
   - Move all `validateUrlSafety` tests from `fetch.test.ts` into this new file
   - Change imports from `"../fetch"` to `"../url-safety"`
   - Add 2-3 new edge case tests (IPv6 addresses, URL with credentials `user:pass@host`, double-encoded URLs)

3. **Update `src/lib/__tests__/fetch.test.ts`:**
   - Remove the moved test blocks (stripHtml describe, extractTitle describe, htmlToMarkdown describe, extractWithReadability describe, validateUrlSafety describe)
   - Remove unused imports (`stripHtml`, `extractTitle`, `extractWithReadability`, `htmlToMarkdown`, `validateUrlSafety`)
   - Keep `isUrl`, `fetchUrlContent`, `downloadImages` tests in place — these are native to `fetch.ts`

**Key constraint:** Total test count should increase (moved tests + new edge cases). No test should be deleted — only relocated.

Verification:
```sh
pnpm test -- --run src/lib/__tests__/html-parse.test.ts
pnpm test -- --run src/lib/__tests__/url-safety.test.ts
pnpm test -- --run src/lib/__tests__/fetch.test.ts
pnpm build && pnpm lint && pnpm test
```
