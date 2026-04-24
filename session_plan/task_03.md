Title: Dataview-style frontmatter query library and API
Files: src/lib/dataview.ts, src/app/api/wiki/dataview/route.ts, src/lib/__tests__/dataview.test.ts
Issue: none

## Description

The founding vision mentions using frontmatter for dynamic queries/tables
("Dataview-style"). Every wiki page already has YAML frontmatter (created, updated,
source_count, tags, source_url). Build a query engine that lets users filter and sort
pages by these fields.

### Changes

1. **`src/lib/dataview.ts`** — New module implementing frontmatter queries:

   ```typescript
   interface DataviewFilter {
     field: string;          // frontmatter field name, e.g. "tags", "created"
     op: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "exists";
     value?: string;         // comparison value (not needed for "exists")
   }

   interface DataviewQuery {
     filters?: DataviewFilter[];
     sortBy?: string;        // frontmatter field to sort by
     sortOrder?: "asc" | "desc";
     limit?: number;         // max results (default 50)
   }

   interface DataviewResult {
     slug: string;
     title: string;
     frontmatter: Record<string, string | string[]>;
   }

   async function queryByFrontmatter(query: DataviewQuery): Promise<DataviewResult[]>
   ```

   Implementation:
   - List all wiki pages via `listWikiPages()`
   - For each, read frontmatter via `readWikiPageWithFrontmatter()`
   - Apply filters: `eq`/`neq` for exact match, `gt`/`lt`/`gte`/`lte` for date/number
     comparison, `contains` for array membership (tags), `exists` for field presence
   - Sort by the specified field (string comparison, date-aware for ISO dates)
   - Apply limit

2. **`src/app/api/wiki/dataview/route.ts`** — POST endpoint accepting a `DataviewQuery`
   body. Returns `{ results: DataviewResult[], total: number }`. Validates the query
   (rejects unknown ops, enforces max limit of 200).

3. **`src/lib/__tests__/dataview.test.ts`** — Comprehensive tests:
   - Filter by tag contains
   - Filter by created date range (gt/lt)
   - Filter by source_count (gte)
   - Filter by exists (has source_url)
   - Sort by created asc/desc
   - Limit enforcement
   - Empty filters returns all pages
   - Unknown field returns empty (doesn't crash)

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
