Title: Consolidate process.env reads in embeddings.ts through config layer
Files: src/lib/embeddings.ts (modify), src/lib/config.ts (modify if needed), src/lib/__tests__/embeddings.test.ts (modify if needed)
Issue: none

## Description

`embeddings.ts` still reads `process.env.EMBEDDING_MODEL` (2 places) and `process.env.OLLAMA_BASE_URL` (1 place) directly, bypassing the config layer introduced in earlier sessions. This was flagged in the learnings file ("Retrofitting a config store doesn't retrofit its readers") and listed as tech debt #1 in the status report.

### Current state

In `embeddings.ts`:
- Line 63: `const override = process.env.EMBEDDING_MODEL;` in `getEmbeddingModelName()`
- Line 99: `const override = process.env.EMBEDDING_MODEL;` in `getEmbeddingModel()`  
- Line 146: `process.env.OLLAMA_BASE_URL` in `_createEmbeddingModel()`

The config layer (`config.ts`) already has:
- `embeddingModel` field in `AppConfig` interface
- `ollamaBaseUrl` field resolved from env + config
- `getEffectiveSettings()` returns `embeddingModel` and `embeddingModelSource`
- `getResolvedCredentials()` returns `ollamaBaseUrl`

### Plan

1. In `getEmbeddingModelName()`: Check env var first (for backward compat), then fall back to `loadConfigSync().embeddingModel`. Keep the env var as highest priority but add config as fallback.

2. In `getEmbeddingModel()`: Same pattern — env var → config → provider default.

3. In `_createEmbeddingModel()`: Get `ollamaBaseUrl` from `loadConfigSync().ollamaBaseUrl` with env var fallback (env should still win for deployment flexibility, but config file should be consulted).

4. Update any tests that mock `process.env` to verify the config fallback path works.

### Key constraints
- Env vars MUST still take precedence (deployment override)
- Config file is the fallback for UI-configured settings
- Don't introduce async where there's currently sync (`loadConfigSync` is already available)
- Don't create a circular dependency (config.ts already imports from embeddings.ts — check this!)

### Circular dependency check
`config.ts` imports `hasEmbeddingSupport` from `embeddings.ts`. If `embeddings.ts` starts importing from `config.ts`, that's a cycle. Solution: use `loadConfigSync` which is a simple JSON read — or extract the shared interface to break the cycle. Check carefully before implementing.

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```
All tests must pass. Specifically verify embeddings test suite passes.
