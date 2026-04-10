Title: Fix embedding config disconnection bug
Files: src/lib/embeddings.ts, src/lib/__tests__/embeddings.test.ts
Issue: none

## Problem

`getEmbeddingModel()` in `embeddings.ts` only reads from environment variables (`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OLLAMA_BASE_URL`, `EMBEDDING_MODEL`). It completely ignores the `embeddingModel` field stored in the config JSON file via the Settings UI.

This means users who configure their embedding model through the browser Settings page get no vector search — the setting is saved but never read by the embedding layer. This is a real bug that silently breaks vector search for browser-configured users.

Similarly, `hasEmbeddingSupport()` only checks env vars, so `getEffectiveSettings()` reports no embedding support even when the user has configured an appropriate provider via the config file.

## Fix

1. **In `getEmbeddingModel()`**: After checking env vars, also load the config file (`loadConfigSync()` from `config.ts`) and use its `provider` and `apiKey` fields to determine which embedding provider to construct. The `embeddingModel` from config should also be respected as a model name override (lower priority than `EMBEDDING_MODEL` env var).

   Resolution order for embedding provider:
   - Env var API keys (existing behavior, highest priority)
   - Config file provider + apiKey (new — if provider is openai/google/ollama and key exists)
   - Return null (no embeddings)

   Resolution order for model name:
   - `EMBEDDING_MODEL` env var (highest)
   - `config.embeddingModel` from config file
   - Provider-specific default (existing)

2. **In `hasEmbeddingSupport()`**: Also check config file — if provider is openai/google/ollama and has a key, return true.

3. **In `getEmbeddingModelName()`**: Also check config file's `embeddingModel` field.

4. **Update tests**: Add test cases verifying that config file values are used when env vars are absent. The existing test file mocks `process.env` — also mock `loadConfigSync` to return config with embedding settings.

## Key constraint

`loadConfigSync()` is synchronous (reads file from disk). `getEmbeddingModel()` is already sync, so this is fine. Make sure to import `loadConfigSync` (not the async `loadConfig`).

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All 364+ tests must pass. New tests should cover:
- Config-only embedding resolution (no env vars, config has openai provider + key)
- Env var takes priority over config
- `hasEmbeddingSupport()` returns true when config has compatible provider
- `getEmbeddingModelName()` reads from config when env var absent
