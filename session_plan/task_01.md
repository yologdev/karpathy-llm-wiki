Title: Migrate wiki.ts from raw fs to StorageProvider
Files: src/lib/wiki.ts, src/lib/storage/types.ts (read-only reference)
Issue: #8 (partial — wiki.ts portion)

## Context

wiki.ts is the foundational file that every other lib file depends on. It has 7
direct `fs.*` calls (2x mkdir, 2x readFile, 2x writeFile, plus readFile in
readWikiPageWithFrontmatter). The StorageProvider interface and
FilesystemStorageProvider already exist and are tested.

Migrating wiki.ts to StorageProvider is the first domino — once it works, all
downstream files (lifecycle.ts, ingest.ts, search.ts, etc.) can follow the same
pattern.

## What to change

1. **Replace `import fs from "fs/promises"` with `import { getStorage } from "./storage"`**
   - Also remove `import path from "path"` if no longer needed (check first)

2. **Convert each `fs.*` call to its StorageProvider equivalent:**
   - `fs.readFile(filePath, "utf-8")` → `getStorage().readFile(relativePath)`
     - Note: StorageProvider uses *relative* paths from the data directory root.
       wiki.ts currently builds absolute paths via `${getWikiDir()}/${slug}.md`.
       The relative path should be `wiki/${slug}.md` or similar.
     - Check how FilesystemStorageProvider.resolve() works to understand the
       path convention.
   - `fs.writeFile(filePath, content, "utf-8")` → `getStorage().writeFile(relativePath, content)`
   - `fs.mkdir(dir, { recursive: true })` → no-op (writeFile creates parent dirs)

3. **Simplify `ensureDirectories()`:**
   - Since `FilesystemStorageProvider.writeFile()` already does `mkdir -p`, and
     object storage doesn't need directories, `ensureDirectories` can become a
     no-op.
   - Keep the function signature for backward compatibility (4 callers).
   - Add a comment explaining that writeFile guarantees parent-dir creation.

4. **Path convention:**
   - The storage provider uses paths relative to `getDataDir()`. So a wiki page
     at `{dataDir}/wiki/foo.md` becomes `wiki/foo.md` relative.
   - Audit every path construction in wiki.ts and convert to relative form.
   - `getWikiDir()` returns an absolute path. For storage calls, use `"wiki"` as
     the prefix directly.
   - Keep `getWikiDir()` and `getRawDir()` exports for callers that still need
     absolute paths (gradual migration).

5. **The `beginPageCache` / `withPageCache` pattern uses an in-memory Map —
   this doesn't touch fs and needs no changes.**

6. **`listWikiPages` reads `wiki/index.md` — convert that readFile call.**

7. **`updateIndexUnsafe` writes `wiki/index.md` — convert that writeFile call.**

## Important: path mapping

Check `FilesystemStorageProvider` constructor — it takes a `basePath` and
resolves relative paths against it. The `getDataDir()` function returns the
project data root. So:
- `getStorage().readFile("wiki/foo.md")` should read `{dataDir}/wiki/foo.md`
- `getStorage().listFiles("wiki")` should list files in `{dataDir}/wiki/`

Verify this by reading the FS provider's `resolve()` method.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 1,605 tests must pass. The wiki.test.ts (1,924 lines) and lifecycle.test.ts
(594 lines) are the critical test suites — if those pass, the migration is
correct.
