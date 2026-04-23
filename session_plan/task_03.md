Title: Fuzzy search with typo tolerance in GlobalSearch
Files: src/lib/search.ts, src/lib/__tests__/search.test.ts, src/components/GlobalSearch.tsx
Issue: none

## Description

The GlobalSearch component currently does exact substring matching via
`searchWikiContent()`. Users who mistype a query ("attnetion" instead of
"attention") get zero results. Adding fuzzy matching with typo tolerance
will significantly improve the browse experience.

### Changes

1. **src/lib/search.ts** — Add a `fuzzyMatch(query: string, text: string, maxDistance?: number): boolean`
   function that implements Levenshtein-based fuzzy matching:
   - For each word in the query, check if any word in the text is within
     edit distance ≤ `maxDistance` (default: 2 for words ≥ 5 chars, 1 for
     shorter words, 0 for words ≤ 2 chars).
   - Use a simple iterative Levenshtein distance function (no dependencies).
   - Also add `fuzzySearchWikiContent(query: string): Promise<ContentSearchResult[]>`
     that works like `searchWikiContent` but falls back to fuzzy matching when
     exact matching returns fewer than 3 results. This way exact matches are
     preferred but fuzzy fills in when needed.
   - The fuzzy results should be scored lower than exact matches (append them
     after exact results, possibly with a `fuzzy: boolean` flag on
     `ContentSearchResult`).

2. **src/lib/__tests__/search.test.ts** — Add tests for the fuzzy matching:
   - `fuzzyMatch("attention", "attnetion")` → true (edit distance 2)
   - `fuzzyMatch("transformer", "transformers")` → true (edit distance 1)
   - `fuzzyMatch("AI", "XY")` → false (too short for fuzzy, exact only)
   - `fuzzyMatch("neural", "neurla")` → true (transposition)
   - `fuzzyMatch("cat", "dog")` → false (distance 3, too high)
   - Integration test with `fuzzySearchWikiContent` using temp wiki files

3. **src/components/GlobalSearch.tsx** — Update the search handler:
   - Switch from `searchWikiContent` to `fuzzySearchWikiContent` (or update
     the API call if search goes through `/api/wiki/search`).
   - If results include fuzzy matches, show a subtle "(fuzzy match)" indicator
     next to those results so users understand why they appeared.
   - Check whether GlobalSearch calls the API route or the library directly.
     If it goes through `/api/wiki/search`, update that route too (but that's
     a 4th file — check if it's necessary).

### Important constraints

- The Levenshtein function must be self-contained (no new dependencies).
- Keep it simple — we're matching individual words, not doing full-text
  fuzzy scoring. This is for typo tolerance, not semantic search.
- Don't break the existing exact search behavior. Fuzzy is a fallback.
- Max 5 files touched. Check if `/api/wiki/search` route needs updating;
  if GlobalSearch calls the library directly, skip the route.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```
