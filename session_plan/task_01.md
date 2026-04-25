Title: Improve query re-ranking prompt quality
Files: src/lib/query.ts, src/lib/__tests__/query.test.ts
Issue: none

The LLM re-ranking step in `searchIndex()` has been flagged for improvement for 10+ sessions but never addressed. Currently it sends a bare prompt asking for a JSON array of slugs with 500-char snippets. This produces decent but not great results because:

1. The snippets are the **first 500 chars** of each page, which may not be the most relevant section
2. The prompt doesn't give the LLM criteria for judging relevance
3. No chain-of-thought — the LLM jumps straight to ranking without reasoning

**Changes to `src/lib/query.ts`:**

1. **Improve RERANK_PROMPT** — Add explicit relevance criteria:
   - Direct topic match (does the page directly address the question?)
   - Conceptual relevance (does it contain background/context needed to answer?)
   - Citation potential (does it contain facts/data the answer should cite?)
   - Ask the LLM to think briefly before producing the JSON array (chain-of-thought)

2. **Better snippet extraction** — Instead of `page.content.slice(0, RERANK_SNIPPET_CHARS)`, extract the section of the page body that has the highest BM25 overlap with the question tokens. This means the LLM sees the most query-relevant portion of each page, not just the intro.
   - Add a helper function `extractBestSnippet(content: string, queryTokens: string[], maxChars: number): string` that slides a window over the content and picks the window with the highest token overlap.
   - Fall back to first-N-chars if the page is shorter than the window.

3. **Increase snippet size** — Bump `RERANK_SNIPPET_CHARS` from 500 to 800. The re-ranker is the gatekeeper for which pages get loaded in full — giving it more context is worth the extra tokens.

**Changes to `src/lib/__tests__/query.test.ts`:**

- Update existing re-ranking tests to match the new prompt structure
- Add a test for `extractBestSnippet` verifying it selects the most relevant window
- Verify the re-ranking prompt includes relevance criteria text

**Verification:** `pnpm build && pnpm lint && pnpm test`
