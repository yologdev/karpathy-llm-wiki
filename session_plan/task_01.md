Title: Implement FilesystemStorageProvider
Files: src/lib/storage/filesystem.ts, src/lib/storage/index.ts, src/lib/__tests__/storage-fs.test.ts
Issue: #7

## Description

Implement the `FilesystemStorageProvider` class that wraps Node.js `fs` operations
behind the `StorageProvider` interface. This turns the dead-code abstraction into
a live, testable module and unblocks issues #8–#10 (gradual migration of existing
code to use the abstraction).

### Implementation Plan

Create `src/lib/storage/filesystem.ts`:

1. **Constructor** takes a `basePath: string` (the root directory for all storage).
   All paths passed to methods are resolved relative to this base.

2. **Text file operations:**
   - `readFile(path)` → `fs.readFile(resolve(path), 'utf-8')`
   - `writeFile(path, content)` → ensure parent directory exists, then `fs.writeFile`
   - `deleteFile(path)` → `fs.unlink`
   - `listFiles(prefix)` → `fs.readdir` with `withFileTypes: true`, map to `FileEntry[]`
   - `fileExists(path)` → `fs.access` with catch → boolean
   - `appendFile(path, content)` → ensure parent dir, then `fs.appendFile`
   - `stat(path)` → `fs.stat` → map to `FileInfo`
   - `deleteDirectory(path)` → `fs.rm({ recursive: true, force: true })`

3. **Asset operations:**
   - `writeAsset(path, data)` → `fs.writeFile` with `Buffer.from(data)`
   - `readAsset(path)` → `fs.readFile` → `.buffer` as ArrayBuffer

4. **Optimistic concurrency:**
   - `readFileWithEtag(path)` → read content + stat, build etag as `${mtime.getTime()}-${size}`
   - `writeFileIfMatch(path, content, etag)` → stat the file, compare etag, if match then write + return true, else return false

5. **Derived indexes:**
   - Store in `<basePath>/.indexes/<key>.json`
   - `getIndex(key)` → read and JSON.parse, return null on ENOENT
   - `putIndex(key, value)` → JSON.stringify and write

6. **Embeddings:**
   - Store in `<basePath>/.indexes/embeddings.json` as a single JSON file (matches existing `vector-store.json` approach)
   - `upsertEmbedding(id, vector, metadata)` → load store, insert/update entry, save
   - `queryEmbeddings(vector, topK)` → load store, cosine similarity, sort, take topK
   - `removeEmbedding(id)` → load store, filter out, save

### Wire into factory

Update `src/lib/storage/index.ts`:
- Import `FilesystemStorageProvider`
- In the `"fs"` case, instantiate with `getDataDir()` as basePath
- Remove the "not yet implemented" error

### Tests

Create `src/lib/__tests__/storage-fs.test.ts` with tests for:
- read/write/delete text files
- listFiles returns correct entries
- fileExists true/false
- appendFile creates and appends
- stat returns correct metadata
- deleteDirectory removes recursively
- writeAsset/readAsset round-trips binary
- readFileWithEtag returns consistent etag
- writeFileIfMatch succeeds on match, fails on mismatch
- getIndex/putIndex round-trip JSON
- upsertEmbedding + queryEmbeddings returns nearest neighbors
- removeEmbedding removes correctly

Use a temp directory (os.tmpdir + mkdtemp) for isolation.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must still pass. The new test file must pass.
