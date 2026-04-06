Title: Core library — wiki.ts and llm.ts modules with tests
Files: src/lib/wiki.ts, src/lib/llm.ts, src/lib/__tests__/wiki.test.ts, src/lib/types.ts
Issue: #1

## Description

Build the core library modules that the rest of the app depends on. These are pure TypeScript modules with no React dependencies — they handle wiki file I/O and LLM communication.

### Depends on
Task 01 must be completed first (project scaffold must exist).

### Files to create

#### `src/lib/types.ts`
Shared types used across the library:
- `WikiPage` — `{ slug: string; title: string; content: string; path: string }`
- `IndexEntry` — `{ slug: string; title: string; summary: string }`
- `IngestResult` — `{ rawPath: string; wikiPages: string[]; indexUpdated: boolean }`

#### `src/lib/wiki.ts`
Wiki filesystem operations. All paths relative to project root, using `wiki/` and `raw/` directories.

Functions:
- `ensureDirectories()` — create `raw/` and `wiki/` dirs if they don't exist
- `readWikiPage(slug: string): Promise<WikiPage | null>` — read `wiki/{slug}.md`, return null if not found
- `writeWikiPage(slug: string, content: string): Promise<void>` — write content to `wiki/{slug}.md`
- `listWikiPages(): Promise<IndexEntry[]>` — parse `wiki/index.md` and return entries. If index doesn't exist, return empty array.
- `updateIndex(entries: IndexEntry[]): Promise<void>` — write `wiki/index.md` from entries array. Format: `# Wiki Index\n\n` then for each entry: `- [Title](slug.md) — summary`
- `saveRawSource(id: string, content: string): Promise<string>` — write to `raw/{id}.md`, return path
- `appendToLog(entry: string): Promise<void>` — append a timestamped entry to `wiki/log.md`

Use `fs/promises` for all I/O. Use `path.join(process.cwd(), 'wiki')` and `path.join(process.cwd(), 'raw')` as base paths.

#### `src/lib/llm.ts`
Anthropic Claude API wrapper. Thin abstraction that the ingest module will call.

- `callLLM(systemPrompt: string, userMessage: string): Promise<string>` — call Claude API, return text response
- Use `@anthropic-ai/sdk` package
- Read API key from `process.env.ANTHROPIC_API_KEY`
- Use `claude-sonnet-4-20250514` model (or latest available)
- If no API key is set, throw a clear error: "ANTHROPIC_API_KEY environment variable is required"
- Add `pnpm add @anthropic-ai/sdk`

#### `src/lib/__tests__/wiki.test.ts`
Tests for wiki.ts using vitest:
- Test `updateIndex` + `listWikiPages` roundtrip (write index, read it back)
- Test `writeWikiPage` + `readWikiPage` roundtrip
- Test `readWikiPage` returns null for non-existent page
- Test `saveRawSource` writes file correctly
- Use a temporary directory (vitest `beforeEach`/`afterEach` with `fs.mkdtemp`) — override the wiki/raw paths for testing. Consider making the base path configurable or using environment variables.

**Important**: To make wiki.ts testable, the base paths (`wiki/` and `raw/`) should be configurable. Either:
- Accept an optional `basePath` parameter in each function, OR
- Export a `WIKI_DIR` and `RAW_DIR` that tests can override, OR
- Use a config object that tests can mock

The simplest approach: have a `getWikiDir()` and `getRawDir()` function that reads from env vars (`WIKI_DIR`, `RAW_DIR`) with defaults to `path.join(process.cwd(), 'wiki')` and `path.join(process.cwd(), 'raw')`.

### Verify
```sh
pnpm build && pnpm lint && pnpm test
```
All wiki.ts tests should pass. Build should succeed (llm.ts imports @anthropic-ai/sdk which must be installed).
