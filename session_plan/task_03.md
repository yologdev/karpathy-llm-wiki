Title: Attribution wiring + discuss gitignore
Files: src/lib/ingest.ts, src/lib/lint-fix.ts, src/app/api/wiki/[slug]/route.ts, .gitignore
Issue: none

## What

Two related fixes from the assessment's friction findings:

### 1. Wire author attribution through all write paths

The `writeWikiPageWithSideEffects` function accepts `author?: string` and stores it in the revision sidecar. But most callers don't pass it:

**Ingest pipeline** (`src/lib/ingest.ts`):
- The `ingest()` function calls `writeWikiPageWithSideEffects()` at line ~514 without passing `author`.
- Add `author: "system"` to the ingest call. The ingest pipeline is automated — "system" is the honest attribution.
- The `IngestOptions` interface doesn't need an `author` field yet — when Phase 3 adds X mention ingestion, the `triggered_by` from the source entry can become the author. For now, "system" is correct.

**Lint-fix pipeline** (`src/lib/lint-fix.ts`):
- Multiple fix functions call `writeWikiPageWithSideEffects()` — `fixOrphanPage`, `fixEmptyPage`, `fixMissingCrossRef`, `fixContradiction`, `fixMissingConceptPage`, `fixStalePage`, `fixUnmigratedPage`.
- Each of these should pass `author: "lint-fix"` to distinguish automated lint fixes from human edits in the revision history.
- Find all calls to `writeWikiPageWithSideEffects` in `lint-fix.ts` and add `author: "lint-fix"`.

**Wiki PUT route** (`src/app/api/wiki/[slug]/route.ts`):
- The PUT handler for editing pages doesn't pass `author`.
- Accept an optional `author` field from the request body alongside `content`.
- Pass it through to `writeWikiPageWithSideEffects()`. Default to `undefined` (preserving current behavior) if not provided.

### 2. Add `discuss/` to .gitignore

The `discuss/` directory stores user-generated talk page data (like `wiki/` and `raw/`). It should be gitignored.

Add `/discuss/` to `.gitignore` alongside the existing `/wiki/` and `/raw/` entries.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

No new tests needed — the existing revision tests already verify that author attribution flows through `saveRevision()`. This task just ensures the callers actually pass it.
