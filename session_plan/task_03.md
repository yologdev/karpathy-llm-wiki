Title: Integration test: ingest → query end-to-end pipeline
Files: src/lib/__tests__/integration.test.ts

Issue: none

## Description

All 1177 existing tests are unit tests that mock the LLM and test modules in isolation. There is no integration test that exercises the ingest→query pipeline end-to-end (with mocked LLM but real filesystem). Add one.

### Implementation

Create `src/lib/__tests__/integration.test.ts` with the following test cases. Use a real tmpdir for WIKI_DIR and RAW_DIR (same pattern as other test files), mock only `callLLM` and `hasLLMKey` from `../llm` and `searchByVector`/`upsertEmbedding`/`removeEmbedding` from `../embeddings`.

**Test 1: "ingest text then query retrieves it"**
1. Mock `hasLLMKey` to return `true`.
2. Mock `callLLM` to:
   - On first call (ingest): return a wiki page markdown string with a known fact (e.g., "# Photosynthesis\n\nPhotosynthesis converts sunlight into chemical energy in plants.").
   - On second call (if re-ranking is triggered): return a JSON array of slugs.
   - On third call (query answer): return an answer citing the slug.
3. Call `ingest("Photosynthesis", "Photosynthesis is the process by which plants convert sunlight...")`.
4. Verify the result has `pages` with at least one entry.
5. Call `listWikiPages()` and verify the ingested page appears in the index.
6. Call `query("How do plants make energy?")`.
7. Verify the result has a non-empty `answer` and `sources` includes the ingested slug.

**Test 2: "ingesting two sources creates cross-references"**
1. Mock `callLLM` to return appropriate content for two related topics (e.g., "Photosynthesis" and "Chlorophyll").
2. Ingest both sequentially.
3. Call `listWikiPages()` and verify both appear.
4. Read the second wiki page's content and verify it was written (non-empty).

**Test 3: "query on empty wiki returns appropriate error"**
1. Mock `hasLLMKey` to return `true`.
2. Call `query("anything")` against the empty tmpdir.
3. Verify it throws or returns an error indicating no wiki pages exist.

### Key considerations

- The `callLLM` mock needs to handle multiple sequential calls. Use `mockResolvedValueOnce()` for each expected call in sequence.
- Import `ingest` from `../ingest`, `query` from `../query`, `listWikiPages` from `../wiki`.
- The ingest function expects `callLLM` to return markdown content. Check the ingest implementation to understand what format it expects.
- Keep the test file under 200 lines. Focus on verifying the pipeline connects, not edge cases (those are already covered by unit tests).

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must still pass, plus the new integration tests.
