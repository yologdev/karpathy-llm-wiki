Title: Test suite for raw.ts
Files: src/lib/__tests__/raw.test.ts
Issue: none

Add a dedicated test suite for `raw.ts` (125 lines) — the raw source persistence module.

## Functions to test

1. **saveRawSource(id, content)**
   - Writes a file to `raw/<id>.md`
   - Returns the file path
   - Throws on invalid slug (rejects path traversal attempts like `../../etc/passwd`)
   - Creates the raw directory if it doesn't exist

2. **listRawSources()**
   - Returns array of `{ slug, filename, size, modified }` for all files in raw/
   - Sorts newest first (by modified time)
   - Skips dotfiles (e.g. `.hidden`)
   - Skips subdirectories
   - Returns empty array when raw/ doesn't exist (no throw)
   - Strips extension to produce slug (e.g. `notes.md` → `notes`)

3. **readRawSource(slug)**
   - Reads content + metadata for a specific slug
   - Throws on invalid slug
   - Throws when slug doesn't match any file
   - Returns content along with RawSource metadata fields

## Test setup

Use a temp directory pattern matching the existing test files:
- Set `process.env.RAW_DIR` to a temp directory before each test
- Set `process.env.WIKI_DIR` to a temp directory (needed by ensureDirectories)
- Clean up after each test with `fs.rm(tmpDir, { recursive: true, force: true })`

Look at `src/lib/__tests__/wiki.test.ts` for the established pattern of filesystem test setup.

Verify: `pnpm build && pnpm lint && pnpm test`
