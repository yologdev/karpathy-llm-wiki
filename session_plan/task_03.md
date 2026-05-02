Title: Add author attribution to revision system
Files: src/lib/revisions.ts (modify), src/lib/lifecycle.ts (modify), src/lib/__tests__/revisions.test.ts (modify), src/app/api/wiki/[slug]/revisions/route.ts (modify), src/components/RevisionItem.tsx (modify)
Issue: none

The revision system stores page snapshots but doesn't track WHO made each change.
Phase 2 requires "attribution on revisions — who changed what and why." This task
adds the `author` field.

## Changes

### 1. `src/lib/revisions.ts`

- Add `author` field to the `Revision` interface:
  ```ts
  interface Revision {
    timestamp: number;
    date: string;
    slug: string;
    sizeBytes: number;
    author?: string;  // NEW — who made this change
  }
  ```

- Update `saveRevision` signature to accept an optional `author` parameter:
  ```ts
  export async function saveRevision(
    slug: string,
    content: string,
    author?: string,
  ): Promise<void>
  ```

- When author is provided, save it alongside the content. Since revisions are
  stored as plain markdown files (one per timestamp), save a small JSON sidecar
  file `<timestamp>.meta.json` with `{ author }` next to the `.md` file.
  This approach avoids changing the markdown file format.

- Update `listRevisions` to read the `.meta.json` sidecar if it exists and
  populate the `author` field on the returned `Revision`.

### 2. `src/lib/lifecycle.ts`

- `writeWikiPageWithSideEffects` calls `saveRevision`. Thread the `author`
  parameter through. For now, callers that don't know the author pass `undefined`
  (backward compatible).

- Check the `WritePageOptions` interface — if it doesn't have `author`, add it
  as optional.

### 3. `src/app/api/wiki/[slug]/revisions/route.ts`

- In the GET response, include the `author` field if present.
- No changes needed to the POST (revert) endpoint for now.

### 4. `src/components/RevisionItem.tsx`

- Display the author next to the revision date when available:
  `"by {author} · {date}"` or just `"{date}"` if no author.

### 5. `src/lib/__tests__/revisions.test.ts`

- Add test: `saveRevision` with author creates `.meta.json` sidecar.
- Add test: `listRevisions` returns author when sidecar exists.
- Add test: `listRevisions` returns `undefined` author when no sidecar (backward compat).

## Key constraints

- **Backward compatible** — existing revisions without `.meta.json` still work.
  The `author` field is optional everywhere.
- **No format changes to .md files** — revision snapshots remain pure markdown.
- **At most 5 files touched** — revisions.ts, lifecycle.ts, revisions.test.ts,
  revisions route, RevisionItem.tsx.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing revision tests must continue to pass. New tests verify author
round-trip.
