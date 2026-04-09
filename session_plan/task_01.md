Title: Embedding infrastructure — provider-agnostic embed function and local vector store
Files: src/lib/embeddings.ts, src/lib/__tests__/embeddings.test.ts, src/lib/llm.ts
Issue: none

## Description

Add the foundational embedding layer for vector search. This task builds two things:

### 1. `src/lib/embeddings.ts` — Embedding provider + vector store

**Embedding function:**
- `getEmbeddingModel()` — returns an AI SDK embedding model based on configured provider, or `null` if the provider doesn't support embeddings. Provider detection order:
  - OpenAI → `openai.embedding('text-embedding-3-small')`
  - Google → `google.embedding('gemini-embedding-001')`
  - Ollama → `ollama.embedding('nomic-embed-text')` (or similar common model)
  - Anthropic → `null` (Anthropic has no embedding models)
  - No key → `null`
- `hasEmbeddingSupport()` — returns boolean, simple check
- `embedText(text: string): Promise<number[] | null>` — embeds a single text string, returns null if no provider
- `embedTexts(texts: string[]): Promise<number[][] | null>` — batch embed via `embedMany`

**Local vector store:**
The store is a JSON file at `wiki/.vectors.json` (gitignored alongside the rest of wiki/).
```typescript
interface VectorEntry {
  slug: string;
  embedding: number[];
  contentHash: string; // MD5 or simple hash of the page content — used to detect stale embeddings
}
interface VectorStore {
  model: string; // e.g. "text-embedding-3-small" — if model changes, invalidate all
  entries: VectorEntry[];
}
```

Functions:
- `loadVectorStore(): Promise<VectorStore | null>` — read from disk, return null if missing
- `saveVectorStore(store: VectorStore): Promise<void>` — write to disk
- `upsertEmbedding(slug: string, content: string): Promise<void>` — embed content, upsert into store. Skip if contentHash matches (no re-embed needed). If model changed from what's stored, clear all entries and start fresh.
- `removeEmbedding(slug: string): Promise<void>` — remove a slug's entry from the store
- `cosineSimilarity(a: number[], b: number[]): number` — pure math utility
- `searchByVector(query: string, topK: number): Promise<Array<{slug: string, score: number}>>` — embed the query, compute cosine similarity against all stored vectors, return top-K results sorted by score. Return empty array if no embedding support.

### 2. Update `src/lib/llm.ts`

Add `hasEmbeddingSupport()` re-export or a note about embedding provider detection. Actually, keep all embedding logic in embeddings.ts — llm.ts stays focused on text generation. But do add ENV_VAR documentation comments for embedding model override: `EMBEDDING_MODEL` env var.

### 3. Tests in `src/lib/__tests__/embeddings.test.ts`

Test the pure functions without needing an API key:
- `cosineSimilarity` — identical vectors → 1.0, orthogonal → 0.0, opposite → -1.0
- `loadVectorStore` / `saveVectorStore` — round-trip to tmp dir
- `upsertEmbedding` with mocked embed function — verify contentHash prevents re-embedding
- `removeEmbedding` — removes the right slug
- `searchByVector` with pre-loaded store — verify correct ranking order
- `hasEmbeddingSupport` returns false when no keys configured
- Model change detection — store with model "A", current model "B" → store is cleared

Keep the store format simple (flat JSON array). At wiki scale (hundreds of pages, not millions), this is perfectly fine and avoids any external dependency like sqlite or faiss.

## Verification
```sh
pnpm build && pnpm lint && pnpm test
```
