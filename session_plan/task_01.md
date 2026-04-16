Title: Extract wiki-log.ts from wiki.ts
Files: src/lib/wiki-log.ts (new), src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts (maybe)
Issue: none

## Context

`src/lib/wiki.ts` is 440 lines and still mixes FS I/O, index management, log operations, page caching, and re-exports. Last session extracted search helpers into `search.ts` — this session we continue that decomposition by pulling out the **log** section, which is the most self-contained remaining chunk.

The status report, journal, and current assessment all flag this as a Priority 1 tech-debt item. Keeping the split tiny (one concern per session) avoids the "reverted because the refactor exploded" failure mode.

## What to extract

Create `src/lib/wiki-log.ts` containing **exactly** these symbols (currently in `src/lib/wiki.ts` roughly lines 339–420):

- `export type LogOperation = "ingest" | "query" | "lint" | "save" | "edit" | "delete" | "other"`
- the module-local `ALLOWED_LOG_OPERATIONS` const
- `export async function appendToLog(operation, title, details?)`
- `export async function readLog(): Promise<string | null>`

The new module will need to import:
- `fs from "fs/promises"`, `path from "path"` (already used)
- `getWikiDir`, `ensureDirectories` from `./wiki` (or move them later — not this session)
- `withFileLock` from `./lock`

## Backward compatibility — CRITICAL

Many files import log APIs from `@/lib/wiki` (`lint.ts`, `lifecycle.ts`, `lint-fix.ts`, `wiki/log/page.tsx`, several tests). **Do not break any existing imports.**

Keep the re-exports in `wiki.ts`:

```ts
// Log operations — re-exported from wiki-log.ts for backward compat
export { appendToLog, readLog } from "./wiki-log";
export type { LogOperation } from "./wiki-log";
```

After moving the code, delete the now-duplicated original definitions and the `ALLOWED_LOG_OPERATIONS` const from `wiki.ts`. Keep the section header comment pointing at the new module.

## Tests

`src/lib/__tests__/wiki.test.ts` currently tests `appendToLog` / `readLog` via the `wiki` module barrel. Those tests should continue to pass untouched — the re-exports preserve the public API. Do not rewrite them. If you want to add direct-module coverage, that's optional and can be skipped if it grows the task.

## Verification

Run in order, and don't proceed to commit if any step fails:

```sh
pnpm build
pnpm lint
pnpm test
```

All 622 tests must still pass. If they don't, diagnose the regression — a likely culprit is a circular-import between `wiki.ts` and `wiki-log.ts` if you accidentally import something from `wiki.ts` that `wiki-log.ts` doesn't actually need. The only safe imports from `./wiki` into the new file are `getWikiDir` and `ensureDirectories`.

## Out of scope

- Do not also extract `wiki-io.ts`, `wiki-index.ts`, or `wiki-cache.ts`. One split per session. Future sessions will do those.
- Do not change any call sites. This is a pure move + re-export.
- Do not touch `lint-fix.ts`, `lifecycle.ts`, `lint.ts`. They keep importing from `@/lib/wiki`.
