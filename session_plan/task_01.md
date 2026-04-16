Title: Extract BM25 + corpus stats from query.ts into src/lib/bm25.ts
Files: src/lib/bm25.ts (new), src/lib/query.ts, src/lib/__tests__/query.test.ts (maybe split), src/lib/__tests__/bm25.test.ts (new, optional)
Issue: none

## Goal

`src/lib/query.ts` is 570 lines mixing BM25 scoring, corpus stats, Reciprocal Rank Fusion, LLM re-rank, context builder, prompt construction, and the save pipeline. The BM25 + corpus-stats layer has zero query-specific concerns and is a clean extraction target.

## What to do

1. Create `src/lib/bm25.ts` and move the following from `src/lib/query.ts`:
   - The `STOP_WORDS` set
   - `tokenize()` (currently private)
   - `CorpusStats` interface
   - `buildCorpusStats()`
   - `bm25Score()`
   - The `BM25_K1`, `BM25_B` constants import — keep the `BM25_K1`/`BM25_B` usage local to this file (import from `./constants`)
   - Export `tokenize` too since it's useful for other callers; keep `STOP_WORDS` internal unless needed

2. In `src/lib/query.ts`, re-import `tokenize`, `buildCorpusStats`, `bm25Score`, and `CorpusStats` from `./bm25`. Remove the moved definitions. Do NOT move `reciprocalRankFusion`, `searchIndex`, `buildContext`, `buildQuerySystemPrompt`, `selectPagesForQuery`, `query`, or `saveAnswerToWiki` — those stay.

3. If `src/lib/__tests__/query.test.ts` has tests that exercise `bm25Score` / `buildCorpusStats` directly, either:
   - Re-export them from query.ts for test compatibility (simple), or
   - Update the test imports to point at `./bm25`.
   Pick whichever is less invasive. If there are more than ~5 test-file edits required, prefer re-exporting from query.ts.

4. Verify: `pnpm build && pnpm lint && pnpm test`. All 616 tests must still pass. Line count of `src/lib/query.ts` should drop to roughly 420-450.

## Constraints

- Do NOT change any behavior — this is a pure refactor.
- Do NOT touch the tokenize regex or the BM25 formula.
- Keep public API surface of `query.ts` identical (same exports).
- At most 5 files touched.

## Out of scope

- Extracting RRF, re-rank, context builder, or the save pipeline — those are separate extractions for future sessions.
- Adding new tests (optional bonus only if trivial).
