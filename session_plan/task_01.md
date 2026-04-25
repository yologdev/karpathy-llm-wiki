Title: Structured logging module to replace scattered console.warn/error
Files: src/lib/logger.ts, src/lib/__tests__/logger.test.ts
Issue: none

## Description

Replace the 38+ scattered `console.warn` / `console.error` calls across `src/lib/*.ts` with a proper structured logging module. This has been flagged as tech debt across multiple status reports and is the highest-impact quality improvement available.

### Create `src/lib/logger.ts`

Build a minimal structured logger with:

1. **Log levels**: `debug`, `info`, `warn`, `error` — controlled by a `LOG_LEVEL` env var (default: `warn` in production, `error` in test).
2. **Structured output**: Each log call takes a `tag` string (e.g. `"wiki"`, `"ingest"`, `"query"`, `"embeddings"`) and a message, producing output like `[wiki] readWikiPage failed for "foo": Error: ENOENT`.
3. **Silenceable in tests**: Export a `setLogLevel(level)` function so tests can suppress noise without `vi.spyOn(console, 'warn')` hacks. Also respect `process.env.NODE_ENV === 'test'` to default to `error`-only.
4. **API**: `logger.debug(tag, msg, ...args)`, `logger.info(tag, msg, ...args)`, `logger.warn(tag, msg, ...args)`, `logger.error(tag, msg, ...args)`. Keep it simple — no dependencies, no classes, just functions.

The implementation should be ~50-80 lines. Do NOT use any external logging libraries.

### Create `src/lib/__tests__/logger.test.ts`

Test:
- Default log level filtering (warn+ in prod, error in test)
- `setLogLevel` changes which calls produce output
- Each level function calls `console[level]` with the tag prefix
- Resetting log level works

### Do NOT migrate callers in this task

This task only creates the module and its tests. Task 02 will migrate the callers. This keeps the diff small and independently verifiable.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All must pass. The new module should be importable and the tests should cover the core API.
