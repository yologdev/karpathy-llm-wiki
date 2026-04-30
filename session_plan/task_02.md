Title: Decompose query.ts — extract query-search.ts for search/ranking helpers
Files: src/lib/query-search.ts (new), src/lib/query.ts (modified)
Issue: none

## Goal

`query.ts` is 549 lines mixing two responsibilities:
1. **Search and ranking** — finding and scoring wiki pages for a query (extractBestSnippet, reciprocalRankFusion, searchIndex, selectPagesForQuery, buildContext)
2. **LLM query and answer generation** — building prompts, calling the LLM, saving answers (buildQuerySystemPrompt, query, saveAnswerToWiki)

Extract #1 into `src/lib/query-search.ts`. Keep #2 in `query.ts`.

## Key constraint: backwards compatibility

All existing imports from `"./query"` or `"@/lib/query"` must continue working. Add re-exports in `query.ts`:

```ts
export { extractBestSnippet, reciprocalRankFusion, searchIndex, buildContext, selectPagesForQuery } from "./query-search";
```

### New file: `src/lib/query-search.ts`
Move these functions and their associated constants/types:
- `SMALL_WIKI_THRESHOLD` (const)
- `RERANK_CANDIDATE_POOL` (const)
- `RERANK_SNIPPET_CHARS` (const)
- `RERANK_PROMPT` (const)
- `extractBestSnippet`
- `reciprocalRankFusion`
- `searchIndex`
- `selectPagesForQuery`
- `buildContext`

Dependencies: imports from `./wiki`, `./bm25`, `./embeddings`, `./llm`, `./constants`, `./frontmatter`, `./logger`.

### Modified: `src/lib/query.ts`
Remove the moved functions. Import `searchIndex`, `buildContext`, `selectPagesForQuery` from `"./query-search"` (needed by `query()` and `buildQuerySystemPrompt()`). Add re-exports for backwards compatibility.

The existing re-exports of BM25 helpers (`buildCorpusStats`, `bm25Score`, `CorpusStats`) and `extractCitedSlugs` stay in query.ts.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests in `query.test.ts` and `integration.test.ts` must pass unchanged — they import from `"../query"` which re-exports everything.
