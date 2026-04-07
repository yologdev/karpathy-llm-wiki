Title: Log lint passes + add Activity Log to NavHeader
Files: src/lib/lint.ts, src/lib/__tests__/lint.test.ts, src/components/NavHeader.tsx, SCHEMA.md
Issue: none

## Why

Two small, independent gaps from the assessment that both belong to the "log is
a first-class citizen" story from the founding vision:

1. **Lint does not append a log entry** (SCHEMA.md Known Gaps). The founding
   spec says the log "gives a timeline of the wiki's evolution" and lint is one
   of the three core operations — lint passes should be visible in the log.
2. **Activity Log is not in `NavHeader`.** Users can only reach `/wiki/log` via
   a small button on `/wiki`. The log is one of the two "special files" in the
   founding spec and deserves a top-level nav slot alongside Browse / Graph /
   Ingest / Query / Lint.

## What to do

### Part A — log lint passes

1. In `src/lib/lint.ts`, at the end of the `lint()` function (just before the
   `return`), append to the log:

   ```ts
   import { appendToLog } from "./wiki";
   // ...
   const summary = `${issues.length} issue(s): ` +
     `${errorCount} error · ${warningCount} warning · ${infoCount} info`;
   await appendToLog("lint", "wiki lint pass", summary);
   ```

   Use the counts that the function already computes (or derive them from
   `issues` — look at the existing code). Title should be a stable string like
   `"wiki lint pass"` so the log has a consistent label for lint rows.

   If `lint()` currently has multiple return paths (e.g. early return when the
   wiki is empty), append the log line on the happy path only, OR compute it
   once at the top of the function epilogue. Prefer one return site.

2. Add a test in `src/lib/__tests__/lint.test.ts` that:
   - Sets up a tmp wiki with a couple of pages,
   - Calls `lint()`,
   - Reads `log.md` (use `readLog` from `wiki.ts`) and asserts that the most
     recent entry has op = `"lint"` and title = `"wiki lint pass"`.

3. Update `SCHEMA.md`'s "Known gaps" section: remove the "Lint does not append
   a log entry" bullet (it's now fixed). Add a short note in the "Log format"
   section that lint passes append a `lint` op entry with a summary of issue
   counts.

### Part B — Activity Log in NavHeader

4. In `src/components/NavHeader.tsx`, add a nav item for `/wiki/log` with label
   `"Log"`. Place it between `"Graph"` and `"Ingest"` in the existing nav item
   order. Make sure the active-state highlighting (which is already there for
   the other items) works for `/wiki/log` — match the same pattern the
   existing items use. If the active-state logic uses `startsWith`, make sure
   `/wiki/log` doesn't accidentally highlight when you're on `/wiki` or
   `/wiki/[slug]`; prefer an exact-match check for `/wiki/log`.

5. No new tests required for the NavHeader change — it's a 3-line addition —
   but visually verify via `pnpm build` that the page renders without error.

## Verification

```
pnpm build && pnpm lint && pnpm test
```

All existing tests must still pass. The new lint-logging test adds 1+ case.

## Out of scope

- Do NOT rewrite the `/wiki/log` page renderer (that's a separate gap — it's
  the "structured log renderer" the journal claimed shipped but didn't; leave
  it for a future session).
- Do NOT add new log operations beyond `"lint"` (which is already in the
  `LogOperation` union per the assessment).
- Do NOT touch the lint algorithm itself — only add the log call at the end.
- Do NOT restyle the NavHeader; just add one item.
