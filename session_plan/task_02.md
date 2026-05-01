Title: BM25 title boost for query re-ranking quality
Files: src/lib/bm25.ts, src/lib/__tests__/bm25.test.ts
Issue: none

This is the first concrete step on "query re-ranking quality" — the Priority 1 item deferred for 12 consecutive sessions.

**Problem:** BM25 currently concatenates `title + body` (or `title + summary`) into a single text field and scores against it. A query term appearing in the title gets the same weight as one buried in paragraph 47. This is a known weakness — standard BM25F addresses it with field-weighted scoring.

**Implementation — title boost in `bm25Score`:**

1. In `buildCorpusStats`, store title tokens separately alongside the existing `docTokens`. Add a `titleTokens: Map<string, string[]>` field to `CorpusStats`.

2. In `bm25Score`, compute a title-match bonus: for each query term that appears in the title tokens, add a boost factor (e.g., `TITLE_BOOST = 2.0`) multiplied by the IDF of that term. This rewards pages whose titles directly mention the query topic.

3. Add a `TITLE_BOOST` constant to `src/lib/constants.ts` (value: `2.0`).

4. Add tests to `bm25.test.ts` that verify:
   - A page with the query term in its title scores higher than one with the same term only in the body
   - The boost is proportional (more title-matching terms = higher score)
   - A page with zero body matches but title match still gets a meaningful score
   - The boost doesn't cause pathological ranking when titles are very short

**Key constraint:** Don't change the `IndexEntry` type or the `bm25Score` function signature. The boost is internal to the scoring function using data already available in `CorpusStats`.

Verification:
```sh
pnpm test -- --run src/lib/__tests__/bm25.test.ts
pnpm build && pnpm lint && pnpm test
```
