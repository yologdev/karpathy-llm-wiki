Title: Add staleness and low-confidence lint checks
Files: src/lib/lint-checks.ts, src/lib/types.ts, src/lib/__tests__/lint-checks.test.ts
Issue: none

## Context

Phase 1 of yopedia requires new lint checks that use the new frontmatter fields:
- **Stale page** — `expiry` date has passed → the page needs review
- **Low confidence** — `confidence` below a threshold → the page needs more sources

These are the first lint checks that operate on the new yopedia schema fields.
They validate that the schema evolution from tasks 01 and 02 produces actionable
signals.

## Depends on

Tasks 01 and 02 (new frontmatter fields must exist for these checks to find them).

## What to do

### 1. Add new lint issue types (types.ts)

Extend the `LintIssue.type` union:
```typescript
type: "orphan-page" | "stale-index" | "missing-crossref" | "empty-page" 
    | "contradiction" | "missing-concept-page" | "broken-link"
    | "stale-page" | "low-confidence";
```

### 2. Add `checkStalePages` function (lint-checks.ts)

```typescript
export async function checkStalePages(): Promise<LintIssue[]> {
  const pages = await listWikiPages();
  const today = new Date().toISOString().slice(0, 10);
  const issues: LintIssue[] = [];
  
  for (const entry of pages) {
    const page = await readWikiPageWithFrontmatter(entry.slug);
    if (!page) continue;
    const expiry = page.frontmatter.expiry;
    if (typeof expiry === "string" && expiry !== "" && expiry <= today) {
      issues.push({
        type: "stale-page",
        slug: entry.slug,
        message: `Page expired on ${expiry} — content may be outdated`,
        severity: "warning",
        suggestion: `Re-ingest from the original source or manually review and update the expiry date`,
      });
    }
  }
  return issues;
}
```

### 3. Add `checkLowConfidence` function (lint-checks.ts)

```typescript
const LOW_CONFIDENCE_THRESHOLD = 0.3;

export async function checkLowConfidence(): Promise<LintIssue[]> {
  const pages = await listWikiPages();
  const issues: LintIssue[] = [];
  
  for (const entry of pages) {
    const page = await readWikiPageWithFrontmatter(entry.slug);
    if (!page) continue;
    const confidence = page.frontmatter.confidence;
    if (typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD) {
      issues.push({
        type: "low-confidence",
        slug: entry.slug,
        message: `Confidence is ${confidence} (below ${LOW_CONFIDENCE_THRESHOLD}) — page needs more supporting sources`,
        severity: "info",
        suggestion: `Ingest additional sources about "${entry.title}" to improve confidence`,
      });
    }
  }
  return issues;
}
```

### 4. Wire into the main lint function (lint-checks.ts)

Find where all checks are dispatched (likely in a `buildSummary` or main lint
function) and add the two new checks to the list. Make sure they're included
in the default check set and can be filtered by the existing `checks` option.

### 5. Write tests (lint-checks.test.ts)

Add tests for both new checks:

**checkStalePages:**
- Page with `expiry` in the past → produces a stale-page warning
- Page with `expiry` in the future → no issue
- Page with no `expiry` field → no issue (graceful skip)

**checkLowConfidence:**
- Page with `confidence: 0.1` → produces a low-confidence info issue
- Page with `confidence: 0.5` → no issue (above threshold)
- Page with no `confidence` field → no issue (graceful skip)

Use the existing test patterns in lint-checks.test.ts — they write temporary
wiki pages to a temp directory with specific frontmatter, run the check, and
assert on the returned issues.

### 6. Verify

Run `pnpm build && pnpm lint && pnpm test` — all tests must pass.

## Notes

- `stale-page` is a WARNING because it doesn't mean content is wrong, just that
  it should be reviewed.
- `low-confidence` is INFO because it's an opportunity signal, not an error.
- The threshold of 0.3 is deliberately low — only pages with very poor source
  support should trigger this. We can tune it later.
- These checks don't need LLM calls (unlike contradiction checking), so they're
  fast and free to run.
