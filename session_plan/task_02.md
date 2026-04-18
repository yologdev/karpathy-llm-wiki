Title: Dedicated test suite for bm25.ts
Files: src/lib/__tests__/bm25.test.ts
Issue: none

The `bm25.ts` module (166 lines) implements BM25 scoring — the primary search ranking algorithm for query when vector search is unavailable (which is the common case for Anthropic-only users). It has no dedicated tests despite being a pure, deterministic algorithm ideal for unit testing.

Create `src/lib/__tests__/bm25.test.ts` with tests covering:

**tokenize:**
- Basic tokenization (splits on non-alphanumeric, lowercases)
- Stop word removal (verify common stop words like "the", "is", "what" are filtered)
- Short token removal (tokens < 2 chars are dropped)
- Empty string → empty array
- Punctuation-heavy input
- Numbers are preserved as tokens

**buildCorpusStats (with `fullBody: false` to avoid filesystem reads):**
- Empty entries list → N=0, avgdl=0
- Single entry → correct N, avgdl, df, docTokens
- Multiple entries → correct document frequencies (terms appearing in multiple docs)
- Average document length calculated correctly
- Each term's df counts documents, not occurrences (a term appearing 5x in one doc has df=1)

**bm25Score:**
- Empty query tokens → 0
- Empty corpus (N=0) → 0
- Document with no matching tokens → 0
- Single matching term → positive score
- Multiple matching terms → higher score than single
- Term appearing in fewer documents gets higher IDF (more discriminative)
- Longer documents are penalized vs shorter ones with same term frequency (length normalization via `b` parameter)
- Score ordering: verify that for a known small corpus, the expected best-matching document scores highest

Use `BM25_K1` and `BM25_B` constants from `constants.ts` in assertions where relevant.

Import `IndexEntry` from types.ts for building test entries.

Verify: `pnpm build && pnpm lint && pnpm test`
