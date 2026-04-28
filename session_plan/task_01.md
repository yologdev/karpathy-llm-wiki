Title: Test CLI command execution (not just parsing)
Files: src/cli.ts, src/lib/__tests__/cli.test.ts
Issue: none

## Description

The CLI test suite only covers argument parsing (`parseArgs`). The actual command runners
(`runIngestUrl`, `runIngestText`, `runQuery`, `runLint`, `runList`, `runStatus`) are untested.
These functions call real library code, so we need to test them with mocked imports.

### Changes

**src/cli.ts** — Export the command runner functions so they can be tested. Currently they're
private `async function` declarations. Make them exported:
- `runIngestUrl(url: string)`
- `runIngestText()`  
- `runQuery(question: string)`
- `runLint(fix: boolean)`
- `runList(raw: boolean)`
- `runStatus()`

Keep `main()` as the only non-exported function (it's the CLI entry point that reads `process.argv`).

**src/lib/__tests__/cli.test.ts** — Add a new `describe("CLI command execution")` block that
tests each runner with mocked library functions. Use `vi.mock()` to mock the library imports:

1. **`runList(false)`** — Mock `listWikiPages` to return a few test pages. Assert console.log
   was called with the expected slug+title lines.

2. **`runList(true)`** — Mock `listRawSources` to return test sources. Assert console.log output.

3. **`runStatus()`** — Mock `listWikiPages`, `listRawSources`, `getEffectiveSettings`. Assert
   status output includes page count, source count, provider info.

4. **`runQuery(question)`** — Mock `query` to return `{ answer: "test answer", sources: ["slug1"] }`.
   Assert answer goes to stdout and sources to stderr.

5. **`runLint(false)`** — Mock `lint` to return issues. Assert issues are printed and
   `process.exit(1)` is called.

6. **`runLint(false)` with no issues** — Mock `lint` to return empty. Assert "No issues found."

For `runIngestUrl` and `runIngestText`, mock `ingestUrl`/`ingest` and assert console.log
receives the slug. For `runIngestText`, also mock `process.stdin` to provide test input.

Use `vi.spyOn(console, 'log')` and `vi.spyOn(console, 'error')` to capture output.
Use `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })` to
prevent actual exit.

Target: ~8-10 new test cases covering all 6 command runners.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing 1168 tests must still pass, plus the new command execution tests.
