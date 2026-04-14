Title: Query re-ranking — use fusion candidates instead of full index for LLM selection
Files: src/lib/query.ts, src/lib/__tests__/query.test.ts

Issue: none

## Problem

Phase 2 (LLM-based page selection) in `searchIndex()` has a fundamental design issue that's been flagged in **8+ journal entries** but never fixed:

1. It sends the **entire wiki index** to the LLM regardless of size — for a 500-page wiki that's a huge prompt
2. It **replaces** the BM25+vector fusion ranking entirely instead of refining it
3. The LLM only sees index titles/summaries, not actual page content — it can't make quality relevance judgments

## Fix

Refactor `searchIndex()` Phase 2 to be a **re-ranking** step over fusion candidates:

1. Phase 1/1b/1c run as before, producing `fusedSlugs` (top candidates from BM25 + vector)
2. Phase 2 now sends **only the fusion candidates** (not the full index) to the LLM, along with **page content snippets** (first ~500 chars of each candidate page body)
3. The LLM re-ranks/filters these candidates based on actual content relevance to the question
4. If the LLM call fails, fall back to the original fusion ranking (no regression)

### Specific changes in `src/lib/query.ts`:

- Expand `fusedSlugs` candidate pool to `MAX_CONTEXT_PAGES * 2` (e.g., 20 candidates) for re-ranking input
- Replace `INDEX_SELECTION_PROMPT` with a `RERANK_PROMPT` that receives candidate slugs + content snippets + the question
- Load page content for candidates (using `readWikiPage`) and build a snippet for each
- The LLM returns a re-ordered JSON array of the slugs it considers most relevant
- Trim the result to `MAX_CONTEXT_PAGES`
- Fall back to original fusion order on LLM failure

### Changes in `src/lib/__tests__/query.test.ts`:

- Update existing Phase 2 / LLM selection tests to match the new re-ranking behavior
- Add test: LLM re-ranking narrows candidates from fusion results (not full index)
- Add test: LLM re-ranking failure falls back to fusion order
- Add test: re-ranking prompt includes content snippets

### Important constraints:

- The `selectPagesForQuery` public API should not change signature
- Small wiki threshold (<= 5 pages) still returns all pages, no change
- `buildCorpusStats`, `bm25Score`, `reciprocalRankFusion` — no changes needed
- The prompt should ask the LLM to return a JSON array of slugs (same output format as before)

Verify: `pnpm build && pnpm lint && pnpm test`
