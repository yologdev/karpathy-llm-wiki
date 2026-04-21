Title: CLI tool foundation — ingest, query, and lint subcommands
Files: src/cli.ts, package.json, src/lib/__tests__/cli.test.ts
Issue: none

## Context

The founding vision (llm-wiki.md) explicitly describes CLI usage: "the LLM can shell out to it." Currently all operations require the web UI. A headless CLI unlocks scripting, CI pipelines, and integration with agent workflows (Codex, Claude Code, etc.). This is the highest-impact capability gap remaining relative to the founding vision.

## What to build

A minimal CLI entry point at `src/cli.ts` that exposes the three core operations as subcommands:

```bash
pnpm cli ingest <url-or-text>    # ingest a URL or raw text
pnpm cli query "<question>"       # query the wiki
pnpm cli lint                     # run lint checks
```

### Dependencies

Add `tsx` as a devDependency for running TypeScript directly:
```bash
pnpm add -D tsx
```

Add a `cli` script to package.json:
```json
"cli": "tsx src/cli.ts"
```

### src/cli.ts implementation

Use Node.js built-in `process.argv` parsing — no external arg-parsing library needed for 3 subcommands.

```
Usage: pnpm cli <command> [args]

Commands:
  ingest <url>         Ingest a URL into the wiki
  ingest --text        Ingest text from stdin
  query <question>     Query the wiki
  lint                 Run wiki lint checks
  lint --fix           Run lint and auto-fix issues
  help                 Show this help
```

#### `ingest` subcommand
- Call `ingest()` from `src/lib/ingest.ts`
- Accept a URL as positional arg
- Accept `--text` flag to read from stdin (for piped content)
- Print created/updated page slugs to stdout
- Exit 0 on success, 1 on error

#### `query` subcommand  
- Call `query()` from `src/lib/query.ts`
- Accept question as positional arg (quoted string)
- Print the answer text to stdout
- Print cited pages to stderr (so stdout is pipeable)
- Exit 0 on success, 1 on error

#### `lint` subcommand
- Call `lint()` from `src/lib/lint.ts`  
- Print issues as formatted text to stdout
- Accept `--fix` flag to auto-fix (calls `fixLintIssue` from `src/lib/lint-fix.ts`)
- Exit 0 if no issues, 1 if issues found (standard lint exit code convention)

### Error handling

- Missing LLM key → print helpful error message pointing to Settings UI or env vars
- Network errors → print error and exit 1
- All errors go to stderr, results go to stdout

### Test file (src/lib/__tests__/cli.test.ts)

Test the CLI argument parsing logic only (don't test actual ingest/query/lint — those are already tested):
- Parse `["ingest", "https://example.com"]` → correct command + args
- Parse `["query", "what is AI?"]` → correct command + args  
- Parse `["lint"]` → correct command
- Parse `["lint", "--fix"]` → correct command + fix flag
- Unknown command → error message
- Missing args → error message

To make this testable, extract argument parsing into a `parseArgs(argv: string[])` function that returns a structured command object, and test that function directly.

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

Also manually verify:
```bash
pnpm cli help         # should print usage
pnpm cli lint         # should run (may find 0 issues on empty wiki)
```

Note: `pnpm build` is `next build` which won't compile the CLI. The CLI runs via `tsx` directly. But it must not break the Next.js build (no import errors, no type errors).

## Constraints

- Max 5 files touched: src/cli.ts (create), package.json (modify), src/lib/__tests__/cli.test.ts (create) = 3 files
- No external arg-parsing libraries (minimist, commander, yargs) — use process.argv directly
- Keep it simple: no colors, no spinners, no progress bars in v1
- The CLI imports from src/lib/ — it must not import from src/app/ or src/components/
