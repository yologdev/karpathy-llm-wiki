Title: Phase 1 close-out — unmigrated-page lint check + auto-fix migration

Files: src/lib/types.ts, src/lib/lint-checks.ts, src/lib/lint-fix.ts, src/lib/lint.ts, src/lib/__tests__/lint-checks.test.ts

Issue: none

## Context

YOYO.md Phase 1 says: "Migrate existing pages by adding sensible defaults. Don't break anything."
The yopedia frontmatter fields (confidence, expiry, authors, contributors, disputed, supersedes,
aliases, sources) are wired into the ingest pipeline for new pages, but pages ingested before
Phase 1 lack these fields entirely. There's no migration path — they'll stay bare until manually
re-ingested.

## What to build

### 1. New lint check: `unmigrated-page`

Add a `checkUnmigratedPages()` function in `lint-checks.ts` that:
- Reads all wiki pages via `listWikiPages()` + `readWikiPageWithFrontmatter()`
- Flags any page missing ALL THREE of: `confidence`, `authors`, `expiry`
  (these are the core yopedia fields — a page that has none was ingested pre-Phase-1)
- Returns `LintIssue` with type `"unmigrated-page"`, severity `"info"`,
  and a message like "Page lacks yopedia metadata — run auto-fix to migrate"
- Skip infrastructure files (index.md, etc.) using the existing `INFRASTRUCTURE_FILES` set

### 2. Add to LintIssue type union

In `src/lib/types.ts`, add `"unmigrated-page"` to the `LintIssue.type` union.

### 3. Auto-fix: `fixUnmigratedPage()`

Add a `fixUnmigratedPage()` function in `lint-fix.ts` that:
- Reads the page with frontmatter
- Adds sensible defaults for missing yopedia fields:
  - `confidence: 0.5` (moderate — we don't know how well-supported it is)
  - `expiry: <90 days from now as ISO date>` (reasonable review interval)
  - `authors: ["system"]` (migrated by automation, not a human or specific agent)
  - `contributors: []` (empty)
  - `disputed: false`
  - Does NOT add `supersedes` or `aliases` (those are page-specific, no sensible default)
  - Does NOT overwrite any field that already exists
- Writes the page back with `writeWikiPage()` (NOT lifecycle — no side-effects needed,
  this is a metadata-only update)
- Returns a `FixResult` with details of what was added

### 4. Wire into lint orchestrator

In `lint.ts`, add `checkUnmigratedPages` to the check list (gated by the `checks` option
like the others). In `lint-fix.ts`, add the `"unmigrated-page"` case to `fixLintIssue()`.

### 5. Tests

Add tests to the existing `lint-checks.test.ts`:
- A page with no yopedia fields → flagged as unmigrated
- A page with confidence + authors + expiry → not flagged
- A page with only confidence (missing authors/expiry) → not flagged (partial is fine)
- Infrastructure pages (index.md) → never flagged

Add tests for the auto-fix:
- Fix adds defaults without overwriting existing fields
- Fix produces valid frontmatter that round-trips

### 6. Lint filter UI

The LintFilterControls component should already handle the new type dynamically since it
renders based on the issue types present in results. Verify this works — if it uses a
hardcoded list, add `"unmigrated-page"` to it.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must continue to pass. New tests must pass.
