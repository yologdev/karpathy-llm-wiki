Title: Delete flow for wiki pages
Files: src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts, src/app/api/wiki/[slug]/route.ts, src/app/wiki/[slug]/page.tsx
Issue: none

## Why

"Delete/edit flow for wiki pages" has appeared in the "Next:" section of three
consecutive journal entries without landing. Without any way to delete a stale
page, the wiki can only grow — which conflicts with the vision of lint
surfacing fixable issues, and with the ability to recover from a bad ingest.
This task ships the minimum viable delete flow; edit can follow later.

**Dependency note:** This task is independent of task_01 — it touches only
`wiki.ts` (adding a new function), a new API route, and the single-page view.
It will merge cleanly whether or not task_01 has landed.

## What to do

### 1. `deleteWikiPage` in `src/lib/wiki.ts`

Add:

```ts
export interface DeletePageResult {
  slug: string;
  removedFromIndex: boolean;
  strippedBacklinksFrom: string[];
}

export async function deleteWikiPage(slug: string): Promise<DeletePageResult>
```

Implementation:
- `validateSlug(slug)` (throws on traversal / invalid).
- Check the page exists via `readWikiPage(slug)`; if not, throw
  `new Error(\`page not found: ${slug}\`)`.
- `fs.unlink` the `.md` file in the wiki dir (use `getWikiDir()` + `path.join`).
- Read `listWikiPages()`, filter out the entry with this slug, call
  `updateIndex(entries)`. Track whether an entry was actually removed for the
  `removedFromIndex` field.
- **Strip backlinks from linking pages.** Iterate through the remaining
  wiki pages, and for each page whose content contains a markdown link
  matching either `](${slug}.md)` or a `**See also:** ...` line containing
  `${slug}.md`:
  - Remove the single link `[Title](${slug}.md)` (match `\[[^\]]+\]\(${escapedSlug}\.md\)`).
  - If that leaves a trailing `**See also:** \n` (empty) or `**See also:** ,`
    (leading comma) clean it up: drop an empty See-also line entirely; fix
    `**See also:** , X` → `**See also:** X`; fix `X, ` at end-of-line → `X`.
  - Write the cleaned content back via `writeWikiPage`.
  - Record the slug in `strippedBacklinksFrom`.
- Append to log: `appendToLog("other", title ?? slug, \`deleted · stripped
  backlinks from ${n} page(s)\`)`. Use the title from the page we read at the
  start so the log entry is human-readable; fall back to the slug if unknown.
  (We don't have a `"delete"` log op in the enum and adding one is out of
  scope — `"other"` with a clear detail string is fine for MVP.)
- Return `{ slug, removedFromIndex, strippedBacklinksFrom }`.

Escape the slug for the regex — use a small helper:
```ts
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
```

### 2. Tests in `src/lib/__tests__/wiki.test.ts`

Add a `describe("deleteWikiPage")` block with cases:
- deletes the page file
- removes the index entry
- throws on unknown slug
- throws on invalid slug (e.g. `"../evil"`)
- strips a backlink `[Other](other.md)` from a linking page
- strips a `**See also:** [Other](other.md)` line cleanly (leaving no empty
  See-also line behind)
- appends a log entry with op `"other"` and "deleted" in the details

Use the existing test setup helpers (tmp wiki dir) — look at how the other
`wiki.test.ts` tests mount a temporary wiki directory and copy that pattern.

### 3. API route `src/app/api/wiki/[slug]/route.ts`

Create a new file:

```ts
import { NextResponse } from "next/server";
import { deleteWikiPage } from "@/lib/wiki";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const result = await deleteWikiPage(slug);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const status = message.startsWith("page not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

Match the Next.js 15 App Router async-params pattern used by the other API
routes — look at how `src/app/api/wiki/graph/route.ts` and
`src/app/api/ingest/route.ts` handle params and responses, and mirror their
style exactly.

### 4. Delete button on `src/app/wiki/[slug]/page.tsx`

The current page is a server component that renders the wiki page. Add a
**client** component `DeletePageButton` (either inline in the same file with
`"use client"` split out, or as a separate small file
`src/components/DeletePageButton.tsx`) that:
- Shows a red "Delete page" button at the bottom of the page.
- On click, `confirm("Delete this page? This cannot be undone.")`.
- `fetch("/api/wiki/" + slug, { method: "DELETE" })`.
- On success, `router.push("/wiki")` (use `useRouter` from `next/navigation`).
- On failure, show a simple inline error message.

Pass the `slug` to the client component as a prop. The server component in
`src/app/wiki/[slug]/page.tsx` renders it below the markdown content.

## Verification

```
pnpm build && pnpm lint && pnpm test
```

New tests should add at least 6 cases. The build must produce 16 static/dynamic
routes (one more than the current 15) now that `/api/wiki/[slug]` exists.

Manually sanity-check by looking at the built route manifest in the build output.

## Out of scope

- No edit flow (separate task).
- No undo / trash — hard delete only.
- No UI confirmation modal — a plain `window.confirm` is fine for MVP.
- Do NOT add a `"delete"` value to the `LogOperation` enum — use `"other"`
  with a descriptive detail string. Extending the enum would require touching
  the log renderer and possibly the API response types and is scope creep for
  this task.
- Do NOT delete the raw source file from `raw/` — the raw layer is immutable
  per the founding vision. Only the wiki page and its backlinks are removed.
