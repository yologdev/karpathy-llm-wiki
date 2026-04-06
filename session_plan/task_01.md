Title: Implement lint operation — core library + API route
Files: src/lib/lint.ts, src/lib/types.ts, src/app/api/lint/route.ts, src/lib/__tests__/lint.test.ts
Issue: none

## Description

The founding vision (llm-wiki.md) specifies three core operations: ingest, query, and **lint**. Lint is completely missing. This task implements the core lint library and API route.

### What to build

**`src/lib/lint.ts`** — Lint engine with these checks:
1. **Orphan pages** — Wiki pages that exist on disk but aren't listed in `index.md`
2. **Stale index entries** — Index entries whose `.md` file doesn't exist on disk
3. **Missing cross-references** — Pages that mention other page titles/slugs but don't link to them
4. **Empty pages** — Pages with no meaningful content (< 50 chars after stripping the heading)

Each check produces a `LintIssue` with `{ type, slug, message, severity }`.

The main export is `async function lint(): Promise<LintResult>` which runs all checks and returns `{ issues: LintIssue[], summary: string, checkedAt: string }`.

**`src/lib/types.ts`** — Add `LintIssue` and `LintResult` interfaces:
```ts
export interface LintIssue {
  type: 'orphan-page' | 'stale-index' | 'missing-crossref' | 'empty-page';
  slug: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface LintResult {
  issues: LintIssue[];
  summary: string;
  checkedAt: string;
}
```

**`src/app/api/lint/route.ts`** — `POST /api/lint` handler that calls `lint()` and returns the result as JSON.

**`src/lib/__tests__/lint.test.ts`** — Unit tests using temp directories (same pattern as wiki.test.ts):
- Test orphan page detection (page on disk but not in index)
- Test stale index detection (index entry but no file)
- Test empty page detection
- Test clean wiki (no issues)

### Implementation notes

- Use `fs.readdir` on the wiki dir to get actual files on disk, compare with `listWikiPages()` from wiki.ts
- For cross-reference detection: scan each page's content for mentions of other page slugs or titles, check if a markdown link to that page exists
- Filter out `index.md` and `log.md` from the page list (they're not content pages)
- Keep it pure filesystem — no LLM calls needed for lint

### Verification
```
pnpm build && pnpm lint && pnpm test
```
