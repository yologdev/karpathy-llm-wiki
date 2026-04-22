Title: Consolidate remaining process.env bypasses into config layer
Files: src/lib/config.ts, src/lib/wiki.ts, src/lib/embeddings.ts, src/lib/__tests__/config.test.ts
Issue: none

## Description

Four `process.env` reads in `wiki.ts` and `embeddings.ts` still bypass the config layer,
violating the "single source of truth" principle documented in learnings.md (learning about
retrofitting a config store).

### Changes

**src/lib/config.ts** — Add two new exported functions:
- `getWikiDir(): string` — returns `process.env.WIKI_DIR ?? path.join(getDataDir(), "wiki")`
  where `getDataDir()` uses the existing `process.env.DATA_DIR ?? process.cwd()` logic already
  in config.ts line 56.
- `getRawDir(): string` — returns `process.env.RAW_DIR ?? path.join(getDataDir(), "raw")`

Also add:
- `getEmbeddingModelOverride(): string | undefined` — returns `process.env.EMBEDDING_MODEL`
  (centralizes the env read)
- `getOllamaBaseUrl(): string | undefined` — returns `process.env.OLLAMA_BASE_URL ?? cfg.ollamaBaseUrl`
  (unifies the two places this is read)

**src/lib/wiki.ts** — Change `getWikiDir()` and `getRawDir()` to import from config instead
of reading `process.env` directly. Keep the function names and signatures identical so no
downstream callers need to change.

**src/lib/embeddings.ts** — Replace the direct `process.env.EMBEDDING_MODEL` read (line 59)
with a call to config's `getEmbeddingModelOverride()`. Replace the direct
`process.env.OLLAMA_BASE_URL` read (line 161) with config's `getOllamaBaseUrl()`.

**src/lib/__tests__/config.test.ts** — Add tests for the new functions:
- `getWikiDir()` returns default path when no env var set
- `getWikiDir()` respects `WIKI_DIR` env override
- `getRawDir()` returns default path when no env var set
- `getRawDir()` respects `RAW_DIR` env override

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```

After this change, `grep -rn 'process\.env' src/lib/ --include='*.ts' | grep -v __tests__ | grep -v config.ts`
should return zero results (all env access centralized in config.ts).
