Title: Wire vector search into query and ingest pipelines
Files: src/lib/query.ts, src/lib/wiki.ts, src/lib/__tests__/query.test.ts
Issue: none

## Description

With the embedding infrastructure from Task 1 in place, wire it into the two main paths:

### 1. Embed on write — hook into the wiki lifecycle pipeline

In `src/lib/wiki.ts`, update `runPageLifecycleOp`:

- **After step 2 (write the page file)** for write ops: call `upsertEmbedding(slug, content)` from `src/lib/embeddings.ts`. This is fire-and-forget — if embedding fails (no provider, API error), log a warning but don't fail the ingest. The wiki page is the primary artifact; the embedding is a search optimization.
- **After step 2 (unlink the page file)** for delete ops: call `removeEmbedding(slug)`.

This means every ingest and save-answer-to-wiki automatically builds the vector index incrementally. No batch rebuild needed (though one could be added later).

Import carefully to avoid circular deps — `embeddings.ts` should NOT import from `wiki.ts`. The dependency flows: `wiki.ts` → `embeddings.ts` → `llm.ts` (for provider detection only, not for `callLLM`).

### 2. Hybrid search in query — combine BM25 + vector scores

In `src/lib/query.ts`, update `selectPagesForQuery`:

Currently it does:
1. BM25 scoring on all pages
2. Optional LLM reranking of top candidates

Add a vector search step:
1. BM25 scoring → produces `bm25Results: Array<{slug, score}>`
2. Vector search → `searchByVector(question, 20)` → produces `vectorResults: Array<{slug, score}>`
3. **Reciprocal Rank Fusion (RRF)** to combine: for each slug appearing in either list, compute `rrf_score = 1/(k + bm25_rank) + 1/(k + vector_rank)` where `k=60` (standard RRF constant) and rank is position in the sorted list (missing = infinity). This avoids the need to normalize scores between BM25 and cosine similarity, which are on different scales.
4. Sort by RRF score, take top `MAX_CONTEXT_PAGES`.
5. Optional LLM reranking of top candidates (unchanged from current).

If `searchByVector` returns empty (no embedding support), fall back to pure BM25 — exactly the current behavior. This means Anthropic-only users see zero regression.

### 3. Update tests

In `src/lib/__tests__/query.test.ts`, add tests for the hybrid path:
- Mock `searchByVector` to return known results
- Verify RRF fusion produces correct ordering when both sources contribute
- Verify pure-BM25 fallback when vector search returns empty
- Verify that a page ranked low by BM25 but high by vector search gets boosted by fusion

Don't break any existing BM25 tests — the new code path is additive.

### 4. Update SCHEMA.md

Add a note to the "Known gaps" section marking vector search as partially implemented, and add a brief description to the Query operation section noting hybrid BM25+vector search when an embedding provider is available.

## Verification
```sh
pnpm build && pnpm lint && pnpm test
```
