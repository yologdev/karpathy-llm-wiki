Title: Migrate lifecycle.ts from raw fs to StorageProvider
Files: src/lib/lifecycle.ts
Issue: #8 (partial — lifecycle.ts portion)

## Context

lifecycle.ts has exactly 1 direct `fs.*` call: `fs.unlink(filePath)` in the
`deleteWikiPage` function. It also imports `fs from "fs/promises"` and
`path from "path"`. Once wiki.ts is migrated (task_01), lifecycle.ts is trivial.

lifecycle.ts already imports most of its wiki operations from wiki.ts
(writeWikiPage, readWikiPage, listWikiPages, etc.), so the migration surface is
tiny.

## What to change

1. **Replace `import fs from "fs/promises"` with `import { getStorage } from "./storage"`**
   - Also remove `import path from "path"` if no longer needed

2. **Convert the single `fs.unlink(filePath)` call:**
   - Currently in `deleteWikiPage()`: `await fs.unlink(filePath)` where
     `filePath = path.join(getWikiDir(), slug + ".md")`
   - Convert to: `await getStorage().deleteFile(`wiki/${slug}.md`)`

3. **Check for any remaining `path.join` usage and convert to string template
   with relative paths if possible.**

4. **Verify that `deleteWikiPage` still works correctly** — it should delete
   the wiki page file, its revisions, its discussions, update the index, remove
   from search, etc.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

lifecycle.test.ts (594 lines) is the critical test suite. All tests must pass.
