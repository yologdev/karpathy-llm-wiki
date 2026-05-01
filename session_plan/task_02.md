Title: Add yopedia Phase 1 fields to ingest pipeline
Files: src/lib/ingest.ts, src/lib/frontmatter.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Context

Phase 1 requires these new frontmatter fields on every wiki page:
- `confidence` (number 0–1) — how well-supported the content is
- `expiry` (ISO date string) — when the page should be reviewed for staleness
- `authors` (string array) — who created the page
- `contributors` (string array) — who has edited the page
- `disputed` (boolean) — whether the page has unresolved contradictions
- `supersedes` (string) — slug of the page this one replaces (empty by default)
- `aliases` (string array) — alternative names for the page

This task adds these fields to the ingest pipeline where frontmatter is constructed
(around line 387-429 of ingest.ts). It does NOT add the structured `sources[]`
field yet — that requires a separate design (nested objects in frontmatter).

## Depends on

Task 01 (number and boolean support in frontmatter parser).

## What to do

### 1. Add new fields in the ingest frontmatter block (ingest.ts ~line 392)

In the `const frontmatter: Frontmatter = { ... }` block, add:

```typescript
const frontmatter: Frontmatter = {
  created: now,
  updated: now,
  source_count: "1",       // keep as string for backward compat
  tags: [],
  confidence: 0.7,         // NEW: default for fresh ingest (single source)
  expiry: expiryDate,      // NEW: 90 days from now (computed)
  authors: ["system"],     // NEW: system-created by default
  contributors: [],        // NEW: empty until edited
  disputed: false,         // NEW: no disputes on fresh pages
  supersedes: "",          // NEW: empty by default
  aliases: [],             // NEW: no aliases by default
};
```

Compute `expiryDate`:
```typescript
const expiry = new Date();
expiry.setDate(expiry.getDate() + 90);
const expiryDate = expiry.toISOString().slice(0, 10);
```

### 2. Preserve new fields on re-ingest (ingest.ts ~line 404-428)

In the `if (existing)` block where existing frontmatter is preserved:
- Preserve `authors` from existing page (don't reset to ["system"])
- Append "system" to `contributors` if not already present
- Preserve `disputed` from existing (don't reset to false)
- Preserve `supersedes` from existing
- Preserve `aliases` from existing
- Reset `expiry` to 90 days from now (re-ingest refreshes the page)
- Keep `confidence` at 0.7 for re-ingested pages (single source quality)
  - If existing confidence was higher (manually set), preserve it

### 3. Update ingest tests (ingest.test.ts)

Add/update tests to verify:
- New page gets `confidence: 0.7`, `disputed: false`, `authors: ["system"]`
- New page gets `expiry` ~90 days from now
- Re-ingested page preserves `authors`, `aliases`, `disputed`
- Re-ingested page adds "system" to `contributors`
- Re-ingested page resets `expiry`

Find the existing frontmatter-related tests in ingest.test.ts and add assertions
for the new fields alongside existing ones.

### 4. Verify

Run `pnpm build && pnpm lint && pnpm test` — all 1,263+ tests must pass.

## Notes

- `authors: ["system"]` is a placeholder. When user identity is implemented
  (Phase 2), this will become the actual author handle.
- The default confidence of 0.7 means "single source, LLM-generated summary."
  Multi-source pages and human-verified pages should get higher confidence.
- 90-day expiry is a reasonable default. News/current-events pages could get
  shorter expiry; stable reference pages could get longer. For now, uniform.
