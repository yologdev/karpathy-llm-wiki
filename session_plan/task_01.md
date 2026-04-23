Title: Fix bugs — stale SCHEMA.md "Known gaps", raw source 404 page, query-history test noise
Files: SCHEMA.md, src/app/raw/[slug]/not-found.tsx, src/lib/__tests__/query-history.test.ts
Issue: none

## Description

Three small bug/quality fixes bundled into one task because each is under 5 minutes:

### 1. Update stale SCHEMA.md "Known gaps" section

The "Known gaps" section in SCHEMA.md says:
> No image or asset handling on URL ingest — images in source HTML are dropped.

This was fixed in session ~42 (image preservation during ingest). The gap entry should be updated to reflect reality: images in source HTML are now preserved as markdown `![alt](url)` references, but images are NOT downloaded to local storage (which is the remaining gap).

**Edit:** In `SCHEMA.md`, find the bullet about image/asset handling (~line 173) and rewrite it to:
- "Images in source HTML are preserved as markdown `![alt](url)` references during ingest, but not downloaded to local storage. The vision describes an `raw/assets/` directory for local copies."

### 2. Add `not-found.tsx` for raw source pages

`src/app/wiki/[slug]/not-found.tsx` exists for wiki pages, but `src/app/raw/[slug]/not-found.tsx` does not. When `readRawSource` throws and triggers `notFound()`, Next.js falls through to the global 404. Add a route-specific not-found page consistent with the wiki one.

**Create:** `src/app/raw/[slug]/not-found.tsx` — similar structure to the wiki version, with:
- Back link pointing to `/raw`
- Heading: "Source not found"
- Suggestion to check the slug or browse raw sources
- Link to `/ingest` to add new sources

### 3. Silence query-history test noise

The "handles malformed JSON file gracefully" test in `src/lib/__tests__/query-history.test.ts` triggers a `console.warn` from `readHistory()` that prints a SyntaxError to stderr. This is an expected error path — silence it by spying on `console.warn` before the test and restoring after, similar to patterns used elsewhere in the test suite.

**Edit:** `src/lib/__tests__/query-history.test.ts` — wrap the "handles malformed JSON file gracefully" test with `vi.spyOn(console, "warn").mockImplementation(() => {})` and restore with `mockRestore()`.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All three changes are independent and non-breaking.
