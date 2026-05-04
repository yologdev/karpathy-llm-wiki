Title: Complete wiki.ts StorageProvider migration + add rawRelPath helper
Files: src/lib/wiki.ts
Issue: #8

## Description

wiki.ts is in a partially-migrated state — it imports both `fs` and `getStorage()`.
The assessment calls this out as bug #3: "wiki.ts imports both fs and uses
getStorage() — a partially-migrated state that's fragile."

Only 2 raw `fs.` calls remain in wiki.ts (both in `ensureDirectories()`):
- Line 93: `await fs.mkdir(getWikiDir(), { recursive: true });`
- Line 94: `await fs.mkdir(getRawDir(), { recursive: true });`

### What to do

1. **Remove the `fs` import** from wiki.ts entirely.

2. **Rewrite `ensureDirectories()`** to use the StorageProvider. Since
   `writeFile` on the filesystem provider already calls `ensureParent()`,
   `ensureDirectories()` can become a no-op or use a lightweight approach:
   write+delete a sentinel file, or use the storage provider's writeFile to
   a `.gitkeep` file in each directory. The simplest correct approach: since
   every write operation in StorageProvider guarantees parent directory creation,
   `ensureDirectories()` can write a temporary marker file via the storage
   provider and then it's ensured. OR, even simpler: check if we can just call
   `getStorage().writeFile("wiki/.gitkeep", "")` and
   `getStorage().writeFile("raw/.gitkeep", "")`.
   
   Actually, the cleanest approach: since `writeFile` auto-creates parents,
   just ensure directories by writing a `.gitkeep` in each. But that creates
   a file. Better: the StorageProvider could have an `ensureDirectory` method.
   
   Simplest pragmatic fix: Since ALL callers of `ensureDirectories()` are
   immediately followed by a `writeFile` call (which auto-ensures parents in
   StorageProvider), we can make `ensureDirectories()` a no-op for StorageProvider
   mode. But we should still actually ensure directories exist for the filesystem
   case. The right call: use `getStorage().writeFile()` with a `.gitkeep` path,
   OR delegate to the storage layer.
   
   **Recommended approach:** Replace the `fs.mkdir` calls with:
   ```ts
   const storage = getStorage();
   // writeFile auto-creates parent directories, so write a marker
   await storage.writeFile(wikiRelPath(".gitkeep"), "");
   await storage.writeFile(rawRelPath(".gitkeep"), "");
   ```
   This is idempotent and works with any storage backend.

3. **Add `rawRelPath()` helper** alongside `wikiRelPath()`:
   ```ts
   export function rawRelPath(filename: string): string {
     return path.relative(getDataDir(), path.join(getRawDir(), filename));
   }
   ```
   This will be needed by task_02 for raw.ts migration.

4. **Remove the `import fs from "fs/promises"` line** from wiki.ts.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing wiki tests must still pass. The `.gitkeep` approach is harmless —
it just ensures the directory exists.
