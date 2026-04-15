Title: Page revision history — core library
Files: src/lib/revisions.ts, src/lib/__tests__/revisions.test.ts
Issue: none

## Description

The founding vision says "the wiki is just a git repo… you get version history for free." The assessment calls this "the single biggest gap vs. the vision." Add a revision history system so every wiki page edit is tracked and reversible.

### Storage Design

Store revisions in `wiki/.revisions/<slug>/` as timestamped markdown files:
- `wiki/.revisions/<slug>/1713150000000.md` — full page content at that point in time
- Each revision file is the complete page content (including frontmatter) — simple, no diffs

### Core Library: `src/lib/revisions.ts`

Create the following functions:

```typescript
interface Revision {
  timestamp: number;       // Unix ms
  date: string;            // ISO string for display
  slug: string;
  sizeBytes: number;       // length of content
}

// Save current page content as a revision before overwriting
async function saveRevision(slug: string, content: string): Promise<void>

// List all revisions for a page, newest first
async function listRevisions(slug: string): Promise<Revision[]>

// Read a specific revision's content
async function readRevision(slug: string, timestamp: number): Promise<string | null>

// Delete all revisions for a page (called when page is deleted)
async function deleteRevisions(slug: string): Promise<void>

// Get the revisions directory for a slug
function getRevisionsDir(slug: string): string
```

### Integration Point

Hook `saveRevision` into `writeWikiPage()` in `wiki.ts`: before overwriting a file, check if the file already exists. If it does, read the current content and call `saveRevision(slug, currentContent)` to snapshot it. This way every write — whether from ingest, edit, query-save, or lint-fix — automatically creates a revision.

Important: only save a revision if the file already exists (new pages don't have a "previous" version to save).

### Tests: `src/lib/__tests__/revisions.test.ts`

Write tests for:
1. `saveRevision` creates a timestamped file in the correct directory
2. `listRevisions` returns revisions newest-first
3. `listRevisions` returns empty array for pages with no revisions
4. `readRevision` returns content for a valid timestamp
5. `readRevision` returns null for nonexistent timestamp
6. `deleteRevisions` removes the revision directory
7. `writeWikiPage` integration: writing over an existing page creates a revision
8. `writeWikiPage` integration: writing a new page does NOT create a revision

Use temp directories via `WIKI_DIR` env var override, consistent with existing test patterns.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All existing 606 tests must continue to pass. New tests must pass.
