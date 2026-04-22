Title: Add `list` and `status` CLI commands for wiki browsing
Files: src/cli.ts (modify), src/lib/__tests__/cli.test.ts (modify)
Issue: none

## Description

The CLI (`pnpm cli`) currently supports `ingest`, `query`, `lint`, and `help`. But there's no way to see what's in the wiki or check system health from the terminal. Add two new commands that make the CLI a complete standalone tool:

### New commands

1. **`pnpm cli list`** — List all wiki pages (title + slug), one per line
   - Default: show all pages sorted alphabetically by title
   - `--raw` flag: list raw sources instead of wiki pages
   - Format: `slug  title` (tab-separated, pipeable)
   
2. **`pnpm cli status`** — Show wiki health summary
   - Number of wiki pages
   - Number of raw sources
   - Whether LLM is configured (provider name or "not configured")
   - Whether embedding support is available

### Implementation

1. Update `ParsedCommand` type to add:
   - `{ command: "list"; raw: boolean }`
   - `{ command: "status" }`

2. Update `parseArgs()` to handle `list` and `status` subcommands

3. Add `runList()` function:
   - Use `listWikiPages()` from `wiki.ts` for wiki pages
   - Use `listRawSources()` from `raw.ts` for raw sources
   - Output tab-separated `slug\ttitle` lines

4. Add `runStatus()` function:
   - Use `listWikiPages()` for page count
   - Use `listRawSources()` for raw source count
   - Use `getEffectiveSettings()` from `config.ts` for provider info
   - Use `hasEmbeddingSupport()` from `embeddings.ts` for embedding status

5. Wire into `main()` switch statement

6. Update HELP text

7. Add tests for new arg parsing in `cli.test.ts`

### Key constraints
- Output must be pipe-friendly (tab-separated, no color codes, no decorative borders)
- Use dynamic imports (same pattern as existing `run*` functions) to keep startup fast
- Don't add new dependencies

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
