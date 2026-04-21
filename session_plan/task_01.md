Title: Consolidate process.env reads in embeddings.ts and llm.ts
Files: src/lib/embeddings.ts, src/lib/llm.ts, src/lib/__tests__/embeddings.test.ts, src/lib/__tests__/llm.test.ts
Issue: none

## Problem

Known tech debt #1: `embeddings.ts` has 12 direct `process.env` reads that duplicate the provider detection logic already in `config.ts`'s `detectEnvProvider()`. Similarly, `llm.ts`'s `hasLLMKey()` has 5 direct `process.env` reads duplicating the same logic.

This duplication means the env resolution order and provider priority logic is maintained in three places. While the config file fallback was already added to embeddings.ts (fixing the original Settings UI bug), the duplicated env detection code remains as maintenance risk.

## Changes

### embeddings.ts

1. Import `detectEnvProvider` (or its equivalent) from config. Since `detectEnvProvider` is currently not exported, either:
   - Export it from config.ts (preferred — it's a pure helper), OR
   - Create a small exported helper in config.ts like `getEmbeddingCredentials()` that returns `{ provider, apiKey, ollamaBaseUrl, embeddingModel }` by merging env + config

2. Refactor `getEmbeddingModelName()`:
   - Replace the 6 `process.env` reads with a call to the config helper
   - Keep the EMBEDDING_MODEL override check (`process.env.EMBEDDING_MODEL`) — this is embedding-specific and appropriate to stay here
   - Preserve exact same behavior: env vars take priority over config file

3. Refactor `getEmbeddingModel()`:
   - Same approach: replace 6+ `process.env` reads with config helper calls
   - Preserve exact same behavior for constructing provider instances

### llm.ts

4. Refactor `hasLLMKey()`:
   - Replace the 5 `process.env` reads with `detectEnvProvider()` or `getResolvedCredentials()`
   - It already has the config fallback, so just simplify the env check path

### Tests

5. Existing tests in `embeddings.test.ts` and `llm.test.ts` set `process.env` directly — they should continue to pass unchanged because the config layer reads env vars via `detectEnvProvider`. No test changes should be needed unless the refactor subtly changes priority order (which it shouldn't).

6. Add 1-2 tests that verify config-file-only embedding configuration works (set config but no env vars) to cover the path that was historically buggy.

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All 964+ tests must pass. The refactored functions must produce identical results for all existing test cases.

## Constraints

- Do NOT change `config.ts` exports if a circular dependency would result. `config.ts` already imports `hasEmbeddingSupport` from `embeddings.ts`. Adding an export that `embeddings.ts` imports back is fine (it already does `loadConfigSync`), but be cautious about initialization order.
- Keep `process.env.EMBEDDING_MODEL` in embeddings.ts — it's embedding-specific config, not general provider detection.
- Do not change any public API signatures.
