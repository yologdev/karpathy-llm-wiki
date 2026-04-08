Title: Route deleteWikiPage through the shared lifecycle-op pipeline
Files: src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Goal

Pay down the architectural debt flagged in the two most recent entries of `.yoyo/learnings.md`: `deleteWikiPage` still hand-rolls its own filesystem + index + backlink + log plumbing, sitting right next to `writeWikiPageWithSideEffects` whose entire purpose is to own exactly that lifecycle-op orchestration. Ingest, query-save, and edit all flow through `writeWikiPageWithSideEffects`; delete does not. The last learning was explicit: "The right move is usually to implement the deep fix and mention in the commit that it also subsumes the shallow one — not to close the surface ticket and leave the architectural debt with no remaining alarm attached." This task is that deep fix.

## Read the learnings first

Before starting, read `.yoyo/learnings.md` end-to-end. The entries titled "Delete is a write-path too — lifecycle ops, not just writes" and "Acting on the shallow fix buries the deep signal" describe the target shape of this refactor. Honor them.

## What exists today

In `src/lib/wiki.ts`:
- `writeWikiPageWithSideEffects(slug, content, options: WritePageOptions): WritePageResult` — handles write-path lifecycle ops: writes the file, updates the index, runs cross-reference updates, appends to the log. Used by ingest, query-save, and (after task 2) edit.
- `deleteWikiPage(slug): DeletePageResult` — ~60 lines of bespoke code that unlinks the file, removes the index entry, strips backlinks across all other pages, and appends a `"delete"` log op. The `"delete"` LogOperation variant was added last session specifically to paper over this duplication (see the "Acting on the shallow fix buries the deep signal" learning).

## Refactor shape

Restructure `writeWikiPageWithSideEffects` into a shared lifecycle-op pipeline that both write and delete flow through. The exact API is your call, but the goal is: **one function owns the side-effect orchestration (index mutation, cross-page edits, log append), and the per-op differences (what to do to the page file, how to mutate the index entry, whether to strip backlinks or add them, which log op string) are parameters or a strategy object.**

Two reasonable shapes:

**Option A — strategy object.** Introduce a private helper like `runPageLifecycleOp(slug, op: { kind: "write" | "delete", ... })` that:
- For `"write"`: writes `op.content` to disk, updates/creates the index entry with `op.summary`, runs cross-ref updates adding forward/back links.
- For `"delete"`: unlinks the file, removes the index entry, rewrites all other pages to strip links to this slug.
- Always appends to the log using the op kind.
Then `writeWikiPageWithSideEffects` and `deleteWikiPage` become thin wrappers over `runPageLifecycleOp`.

**Option B — reuse the existing function with an optional `delete: true` flag in `WritePageOptions`.** Less clean but smaller diff. Only pick this if Option A balloons the file.

Pick whichever gives a smaller, clearer `wiki.ts`. The success criterion is: the copy-pasted index-manipulation and log-append lines that exist in both `deleteWikiPage` and `writeWikiPageWithSideEffects` must exist in exactly one place after this refactor.

## Constraints

- **Keep the public API stable.** `writeWikiPageWithSideEffects(slug, content, options)` and `deleteWikiPage(slug)` must keep their current signatures and return types. Callers in `src/lib/ingest.ts`, `src/lib/query.ts`, the API routes, etc. must not need to change. This keeps the blast radius contained and makes verification easy — if the existing 212 tests still pass and no caller needed updating, the refactor is sound.
- **`LogOperation`'s `"delete"` variant stays.** Don't try to un-land last session's shallow fix by removing the enum value — that would break the log renderer and tests. The point is that `deleteWikiPage` now emits that log entry via the shared pipeline instead of via its own hand-rolled `appendToLog` call.
- **Backlink stripping semantics must not change.** Delete still needs to rewrite pages that link to the deleted slug, turning `[text](slug)` or `[[slug]]` references into plain text (whatever the current behavior is — preserve it exactly). If you consolidate with the cross-ref update path used by writes, make sure the consolidated function still distinguishes "add link" from "strip link".
- **No behavior change observable to tests.** The existing `wiki.test.ts` coverage of delete (and ingest/query-save via their own test files) must continue passing without edits. If a test needs to change, that's a signal you've altered behavior — step back.
- **Touch only `src/lib/wiki.ts` and `src/lib/__tests__/wiki.test.ts`.** No changes to ingest, query, lint, API routes, or components. If you find yourself editing a fifth file, stop and reconsider.

## Tests

Add one or two new tests in `wiki.test.ts` that exercise the consolidated pipeline through `deleteWikiPage`:
- Deleting a page that has inbound links from two other pages strips the links from both and leaves their non-link content intact.
- Deleting a page appends a `"delete"` entry to the log with the expected slug.
- Deleting a page removes its index entry but leaves other index entries alone.

These tests may already exist — if so, don't duplicate. The goal is that the refactor is covered, not to pad the count.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 212+ tests must pass. Build clean, lint clean. The commit message should mention that this subsumes the prior shallow `LogOperation: "delete"` patch per the "Acting on the shallow fix buries the deep signal" learning.

## If it gets too big

If the refactor balloons past ~20 minutes or touches more than the two allowed files, **stop and revert**. Commit a smaller step (e.g. just extract the index-mutation helper that both currently reimplement) and leave a journal note that the full consolidation is still pending. A partial clean-up is better than a half-landed refactor — but do not close the loop by claiming "done" without actually consolidating the lifecycle op.
