Title: Test suite for lifecycle.ts — write/delete pipeline side effects
Files: src/lib/__tests__/lifecycle.test.ts
Issue: none

Write a comprehensive test suite for `src/lib/lifecycle.ts` (355 lines), the second most significant untested module. This module orchestrates all side effects when wiki pages are created, updated, or deleted — it's the central pipeline that prevents "parallel write-path drift" (see learnings.md).

## What to test

### `writeWikiPageWithSideEffects`

1. **Creates page file** — verify `wiki/<slug>.md` is written with the correct content
2. **Creates index entry** — verify `wiki/index.md` contains a line with the slug, title, and summary
3. **Updates existing index entry** — write twice with same slug, verify index has one entry (no duplicates)
4. **Appends to log** — verify `wiki/log.md` gets an entry with the correct log operation
5. **Cross-referencing** — when `crossRefSource` is a string mentioning an existing page, verify the related page gets a "See also" backlink
6. **Skip cross-ref when null** — when `crossRefSource` is `null`, no related pages are touched
7. **Custom logDetails** — verify the `logDetails` callback receives `updatedSlugs` and its return value appears in the log
8. **Validates slug** — invalid slugs (empty, path traversal, uppercase) throw errors before any writes

### `deleteWikiPage`

9. **Deletes page file** — verify `wiki/<slug>.md` is removed from disk
10. **Removes index entry** — verify `wiki/index.md` no longer contains the deleted slug
11. **Returns removedFromIndex: true** when slug was in index
12. **Returns removedFromIndex: false** when slug wasn't in index (already clean)
13. **Strips backlinks from other pages** — create page A linking to B, delete B, verify A no longer has a link to B
14. **Returns strippedBacklinksFrom** list with the correct slugs
15. **Tolerates already-deleted file** — deleting a slug whose file is already gone should not throw (ENOENT tolerance)
16. **Deletes revisions** — verify revision files for the slug are cleaned up
17. **Validates slug** — invalid slugs throw before any filesystem mutation

### `stripBacklinksTo` (internal helper, tested indirectly via deleteWikiPage)

18. **Strips markdown links** — `[text](slug.md)` is removed
19. **Cleans empty See also lines** — `**See also:**` with no remaining links is removed
20. **Fixes orphaned commas** — `A, , C` becomes `A, C`
21. **Collapses excessive blank lines** — 3+ newlines become 2

## Implementation notes

- Use a real temp directory (`fs.mkdtemp`) for each test, set `WIKI_DIR` env var to point there
- Create helper to set up a wiki directory with index.md and existing pages
- Clean up temp dir in `afterEach`
- The module imports from embeddings (upsertEmbedding/removeEmbedding) — these will be no-ops since no embedding provider is configured in tests, which is fine (they're wrapped in try/catch)
- Use `beforeEach` to set `WIKI_DIR` and `afterEach` to clean up
- Target ~25+ tests covering write, delete, and edge cases

Verify: `pnpm build && pnpm lint && pnpm test`
