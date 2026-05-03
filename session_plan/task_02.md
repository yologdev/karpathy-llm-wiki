Title: Wire scoped search into API routes (search + query + stream)
Files: src/app/api/wiki/search/route.ts, src/app/api/query/route.ts, src/app/api/query/stream/route.ts, src/lib/query-search.ts, src/lib/query.ts
Issue: none (Phase 4 completion — scoped search API)

## Context

Task 01 adds scope filtering to the search library. This task wires that
filtering into the three API routes that perform search/query, and into the
query pipeline functions.

## What to build

### 1. `/api/wiki/search` route — add scope parameter

In `src/app/api/wiki/search/route.ts`:
- Parse `scope` query parameter: `url.searchParams.get("scope")`
- If present, call `resolveScope(scope)` from the search library
- If resolveScope returns null, return 400 error: "Invalid scope or agent not found"
- Pass the resolved scope to `fuzzySearchWikiContent(q, 10, scope)`

### 2. Query pipeline — add scope to selectPagesForQuery

In `src/lib/query-search.ts`:
- Add optional `scopeSlugs?: string[]` parameter to `selectPagesForQuery`
- When provided, filter `entries` to only those with slugs in `scopeSlugs`
  before passing to `searchIndex`
- This keeps searchIndex itself unchanged — filtering happens at the entry point

In `src/lib/query.ts`:
- Add optional `scope?: string` parameter to the `query` function
- If provided, resolve scope via `resolveScope`, get slug list
- Filter `entries` from `listWikiPages()` to only matching slugs
- Pass filtered entries to `selectPagesForQuery`

### 3. Query API routes — accept scope

In `src/app/api/query/route.ts`:
- Parse `scope` from request body
- Pass to `query(question, format, scope)`

In `src/app/api/query/stream/route.ts`:
- Parse `scope` from request body  
- Resolve scope, filter entries before calling `selectPagesForQuery`

### Important constraints
- When scope is provided but resolves to zero pages, return a helpful message
  ("No pages found for scope 'agent:yoyo'") rather than an empty answer
- All existing behavior without scope must be unchanged
- No UI changes in this task — just API

## Verification

```sh
pnpm build && pnpm test
```
