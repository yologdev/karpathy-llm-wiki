Title: Add auto-fix handlers for stale-page and low-confidence lint issues
Files: src/lib/lint-fix.ts, src/lib/__tests__/lint-fix.test.ts
Issue: none

## Context

The `fixLintIssue` dispatcher in `lint-fix.ts` handles 7 check types but throws
`FixValidationError("Auto-fix not supported for this issue type")` for the two
new types: `stale-page` and `low-confidence`. This means clicking "Fix" on these
lint issues in the UI will error. The fix is straightforward.

## What to build

### 1. `fixStalePage(slug: string): Promise<FixResult>`

Auto-fix for `stale-page`: bump the expiry date forward by 90 days from today.

- Read the page with `readWikiPageWithFrontmatter(slug)`
- Parse the frontmatter, update `expiry` to today + 90 days (ISO date string)
- Write back with `writeWikiPage(slug, serializeFrontmatter(data, body))`
- Return `{ fixed: true, message: "Expiry extended to <new-date>" }`
- If page doesn't exist, throw `FixNotFoundError`

### 2. `fixLowConfidence(slug: string): Promise<FixResult>`

Auto-fix for `low-confidence`: a simpler fix — just return a helpful message
directing the user to re-ingest with more sources. This is a "soft fix" that
doesn't modify the page but provides actionable guidance.

Actually, a better approach: bump confidence to the threshold (0.3) and add a
note. But that feels dishonest. Instead:

- Return `{ fixed: false, message: "Low confidence pages need additional sources. Re-ingest from the original source or ingest new sources about this topic to improve confidence." }`

Wait — the FixResult interface needs `fixed: boolean`. Let me check.

Actually, the simplest honest fix: this lint type genuinely can't be auto-fixed
(you need more sources). So instead of throwing an error, return a graceful
`{ fixed: false, message: "..." }` response. But first check if FixResult
supports that pattern.

FixResult has `{ success: boolean, slug: string, message: string }`. The
stale-page fix works (it actually changes something and returns success: true).
For low-confidence, wire it into the switch and throw a user-friendly
FixValidationError rather than the generic "Auto-fix not supported" message.

### Implementation

1. Add `fixStalePage` function
2. Wire both types into the switch statement in `fixLintIssue`:
   - `stale-page` → `fixStalePage(slug)`
   - `low-confidence` → throw `FixValidationError("Low-confidence pages cannot be auto-fixed. Ingest additional sources about this topic to improve confidence.")`
3. Import necessary deps: `readWikiPageWithFrontmatter`, `writeWikiPage`,
   `parseFrontmatter`, `serializeFrontmatter`

### Tests

Add to `src/lib/__tests__/lint-fix.test.ts`:

1. **fixStalePage — happy path**: Create a page with expired `expiry`, call
   fixLintIssue("stale-page", slug), verify expiry is bumped ~90 days forward
2. **fixStalePage — missing page**: Call with nonexistent slug, expect
   FixNotFoundError
3. **low-confidence — throws helpful error**: Call
   fixLintIssue("low-confidence", slug), expect FixValidationError with a
   helpful message (not the generic one)

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```
