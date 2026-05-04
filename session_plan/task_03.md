Title: Migrate revisions.ts to StorageProvider
Files: src/lib/revisions.ts
Issue: #10

## Description

revisions.ts has 8 `fs.` calls — the most of the small-to-medium files. It
manages the `wiki/revisions/<slug>/` directory tree for page history. Migrating
it removes one more file from the 13 direct-fs files.

### The 8 fs calls

1. `fs.mkdir(dir, { recursive: true })` — ensure revisions dir exists
2. `fs.writeFile(filePath, content, "utf-8")` — write revision content
3. `fs.writeFile(metaPath, JSON.stringify(meta), "utf-8")` — write revision metadata
4. `fs.readdir(dir)` — list revision files for a page
5. `fs.stat(filePath)` — get revision file timestamps
6. `fs.readFile(metaPath, "utf-8")` — read revision metadata
7. `fs.readFile(filePath, "utf-8")` — read revision content
8. `fs.rm(dir, { recursive: true, force: true })` — delete all revisions for a page

### Replacements

All paths need to be relative to `getDataDir()`. The revisions directory is
typically `wiki/revisions/<slug>/`. Use a helper function:

```ts
function revisionsRelPath(...segments: string[]): string {
  return path.relative(getDataDir(), path.join(getWikiDir(), "revisions", ...segments));
}
```

Or reuse `wikiRelPath`: `wikiRelPath(path.join("revisions", slug, filename))`.

Replace each call:
1. `fs.mkdir(dir, ...)` → remove (StorageProvider's writeFile auto-creates parents)
2. `fs.writeFile(filePath, content)` → `getStorage().writeFile(revisionsRelPath(slug, filename), content)`
3. `fs.writeFile(metaPath, JSON.stringify(meta))` → `getStorage().writeFile(revisionsRelPath(slug, metaFilename), JSON.stringify(meta))`
4. `fs.readdir(dir)` → `getStorage().listFiles(revisionsRelPath(slug))` → map to filenames
5. `fs.stat(filePath)` → `getStorage().stat(revisionsRelPath(slug, filename))`
6. `fs.readFile(metaPath)` → `getStorage().readFile(revisionsRelPath(slug, metaFilename))`
7. `fs.readFile(filePath)` → `getStorage().readFile(revisionsRelPath(slug, filename))`
8. `fs.rm(dir, ...)` → `getStorage().deleteDirectory(revisionsRelPath(slug))`

Import `getStorage` from `./storage` and `wikiRelPath` from `./wiki` (or use
`getDataDir` + `getWikiDir` to compute relative paths).
Remove `import fs from "fs/promises"`.

### Special considerations

- `listRevisions()` uses `fs.readdir(dir)` which returns string filenames.
  `getStorage().listFiles()` returns `FileEntry[]` — need to extract `.name`
  and filter out directories (revision files are all plain files).
- `deleteRevisions()` uses `fs.rm(dir, { recursive: true, force: true })`.
  `getStorage().deleteDirectory()` does the same thing.
- The `fs.mkdir` call in `saveRevision` can simply be removed since
  `writeFile` on the storage provider creates parent directories automatically.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests in revisions.test.ts must still pass.
