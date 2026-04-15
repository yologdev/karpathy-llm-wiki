Title: Extract search and cross-reference functions from wiki.ts into search.ts
Files: src/lib/search.ts (new), src/lib/wiki.ts, src/lib/lifecycle.ts, src/lib/ingest.ts
Issue: none

## Problem

`wiki.ts` is 681 lines and mixes multiple responsibilities: CRUD operations, caching, index management, logging, search, and cross-reference discovery. The search/cross-ref functions are a cohesive group that can be extracted into their own module.

## Solution

Create `src/lib/search.ts` and move these functions + types from `wiki.ts`:

1. **`findRelatedPages()`** (~line 434, ~55 lines) — LLM-powered related page discovery
2. **`updateRelatedPages()`** (~line 489, ~50 lines) — Update existing pages with cross-refs  
3. **`findBacklinks()`** (~line 541, ~25 lines) — Find pages linking to a given slug
4. **`ContentSearchResult` interface** (~line 566)
5. **`searchWikiContent()`** (~line 581, ~95 lines) — Full-text search across wiki pages
6. **`RELATED_PAGES_PROMPT` constant** (~line 425) — System prompt for `findRelatedPages`

These functions import from `wiki.ts` (`readWikiPage`, `listWikiPages`, `writeWikiPage`) and from `llm.ts` / `links.ts`. The dependency is one-way: search depends on wiki CRUD, not vice versa.

### Steps

1. **Create `src/lib/search.ts`** with the extracted functions, importing what they need from `./wiki`, `./llm`, `./links`, `./frontmatter`, etc.

2. **Update `src/lib/wiki.ts`**:
   - Remove the moved functions and the `RELATED_PAGES_PROMPT` constant
   - Add re-exports for backwards compatibility:
     ```ts
     export { findRelatedPages, updateRelatedPages, findBacklinks, searchWikiContent } from "./search";
     export type { ContentSearchResult } from "./search";
     ```
   This way ALL existing imports from `@/lib/wiki` continue to work unchanged. No consumer needs updating.

3. **Verify** that `src/lib/lifecycle.ts` and `src/lib/ingest.ts` (which import these from `@/lib/wiki`) still compile without changes thanks to the re-exports.

4. **No test changes needed** — tests import from `@/lib/wiki` or mock at the module level, and re-exports preserve the same public API.

### What NOT to do

- Do NOT change any imports in consumer files. The re-exports handle compatibility.
- Do NOT extract CRUD functions (readWikiPage, writeWikiPage, etc.) — those stay in wiki.ts.
- Do NOT extract logging functions — those stay in wiki.ts.
- Do NOT create new tests — existing tests cover this via the re-exports.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 616+ tests must pass. The only observable change is that `wiki.ts` shrinks by ~230 lines and a new `search.ts` file exists.
