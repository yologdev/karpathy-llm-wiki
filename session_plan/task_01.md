Title: Add `reason` field to revisions — "who changed what and WHY"
Files: src/lib/revisions.ts, src/lib/wiki.ts, src/lib/types.ts (RevisionItem component uses its own interface), src/components/RevisionItem.tsx, src/lib/__tests__/revisions.test.ts
Issue: none

## Why

The Phase 2 spec says revisions should track "who changed what and **why**." Currently revisions track `author` but have no `reason`/edit summary field. Adding this completes the attribution story.

## What to do

1. **`src/lib/revisions.ts`** — Add `reason?: string` to the `Revision` interface. Update `saveRevision()` to accept an optional `reason` parameter and write it into the `.meta.json` sidecar alongside `author`. Update `listRevisions()` to read `reason` from the sidecar.

2. **`src/lib/wiki.ts`** — Update `writeWikiPage()` signature to accept `reason?: string` and pass it through to `saveRevision()`. Currently at line ~200: `async function writeWikiPage(slug, content, author?)` → add `reason?` as fourth param.

3. **`src/components/RevisionItem.tsx`** — Add `reason?: string` to the local `Revision` interface. Display the reason beneath the author/date line when present (italic, smaller text).

4. **`src/lib/__tests__/revisions.test.ts`** — Add a test that saves a revision with both `author` and `reason`, then verifies `listRevisions()` returns both fields from the sidecar. Add a test that omitting `reason` still works (backward compat).

**Do NOT** change API routes or lifecycle.ts in this task — those callers can opt-in to passing `reason` later. The point is to add the plumbing so reason can flow through.

## Verify

```sh
pnpm build && pnpm lint && pnpm test
```
