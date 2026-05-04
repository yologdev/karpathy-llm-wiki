Title: Migrate raw.ts, wiki-log.ts, query-history.ts to StorageProvider
Files: src/lib/raw.ts, src/lib/wiki-log.ts, src/lib/query-history.ts
Issue: #10

## Description

These three files are the smallest fs-dependent lib files (124, 87, 132 lines)
with the fewest `fs.` calls (4, 2, 2). Migrating them as a batch removes 3 of
the 13 remaining direct-fs files.

### raw.ts (4 fs calls)

Replace:
- `fs.writeFile(filePath, content, "utf-8")` → `getStorage().writeFile(rawRelPath(id + ".md"), content)`
- `fs.readdir(rawDir, { withFileTypes: true })` → `getStorage().listFiles(rawRelPath(""))` (or the raw prefix)
- `fs.stat(filePath)` → `getStorage().stat(rawRelPath(entry.name))`
- `fs.readFile(filePath, "utf-8")` → `getStorage().readFile(rawRelPath(match.filename))`

Import `rawRelPath` from `./wiki` (added in task_01) and `getStorage` from `./storage`.
Remove the `import fs from "fs/promises"` line.

The `listRawSources()` function uses `fs.readdir` with `withFileTypes: true` to
get Dirent objects. `getStorage().listFiles()` returns `FileEntry[]` with `name`
and `isDirectory` — same shape, just different type. Update the code to use
`FileEntry` instead of `Dirent`.

The `ensureDirectories()` calls can stay — task_01 made it work with StorageProvider.

### wiki-log.ts (2 fs calls)

Replace:
- `fs.appendFile(logPath, block, "utf-8")` → `getStorage().appendFile(wikiRelPath("log.md"), block)`
- `fs.readFile(logPath, "utf-8")` → `getStorage().readFile(wikiRelPath("log.md"))`

Import `wikiRelPath` from `./wiki` and `getStorage` from `./storage`.
Remove the `import fs from "fs/promises"` line.
Remove the `import path from "path"` line if no longer needed.

### query-history.ts (2 fs calls)

Replace:
- `fs.readFile(historyPath(), "utf-8")` → `getStorage().readFile(historyRelPath())`  
- `fs.writeFile(historyPath(), ...)` → `getStorage().writeFile(historyRelPath(), ...)`

Replace `historyPath()` with a `historyRelPath()` that returns
`wikiRelPath("query-history.json")` instead of an absolute path.

Import `wikiRelPath` from `./wiki` and `getStorage` from `./storage`.
Remove the `import fs from "fs/promises"` line.
The `ensureDirectories()` call in `writeHistory()` can stay.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests in raw.test.ts, wiki-log.test.ts, query-history.test.ts
must still pass. These tests use temp directories, so the StorageProvider's
filesystem implementation will handle them transparently.
