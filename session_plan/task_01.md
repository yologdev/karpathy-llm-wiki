Title: Add scope filtering to search library functions
Files: src/lib/search.ts, src/lib/__tests__/search.test.ts
Issue: none (Phase 4 completion — scoped search)

## Context

Phase 4 requires scoped search: `?scope=agent:yoyo` restricts search results to
pages authored by a specific agent. The agent registry already stores page lists
per agent, and frontmatter has `authors[]` fields. This task adds the filtering
layer to the search library.

## What to build

1. Add a `scope?: { agentId: string; slugs: string[] }` parameter to
   `searchWikiContent(query, maxResults, scope?)` and
   `fuzzySearchWikiContent(query, maxResults, scope?)`.

2. When `scope` is provided, filter the file list to only include slugs in
   `scope.slugs`. This is a simple set intersection — the caller resolves the
   agent ID to page slugs before calling search, keeping search.ts decoupled
   from agents.ts.

3. Add a helper function `resolveScope(scopeParam: string): Promise<{ agentId: string; slugs: string[] } | null>`
   in a new file or in `search.ts` that:
   - Parses a scope string like `"agent:yoyo"`
   - Looks up the agent via `getAgent(id)` from agents.ts
   - Returns all page slugs from `identityPages + learningPages + socialPages`
   - Returns null if the scope string format is invalid or agent not found

4. Write tests:
   - `searchWikiContent` with no scope returns all matching pages (existing behavior)
   - `searchWikiContent` with scope returns only pages in the scope's slug list
   - `fuzzySearchWikiContent` with scope similarly filters
   - `resolveScope("agent:yoyo")` returns the right slugs when agent exists
   - `resolveScope("agent:nonexistent")` returns null
   - `resolveScope("invalid")` returns null

## Verification

```sh
pnpm build && pnpm test
```

All existing search tests must still pass. New tests must pass.
