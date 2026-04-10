Title: Content chunking for long documents in ingest
Files: src/lib/ingest.ts, src/lib/llm.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Problem

Gap #1 from assessment: ingest sends full source text to the LLM without token counting. Long articles/papers (up to 100K chars from `MAX_CONTENT_LENGTH`) silently exceed context windows. The `maxOutputTokens` in `llm.ts` is hardcoded to 4096. SCHEMA.md lists "no context window management or token counting" as a known gap.

## Implementation

### 1. Add a `chunkText` function in `src/lib/ingest.ts`

```typescript
export function chunkText(text: string, maxChars: number = 12_000): string[] {
  // Split on paragraph boundaries (\n\n)
  // Greedily combine paragraphs into chunks up to maxChars
  // If a single paragraph exceeds maxChars, split on sentence boundaries
  // Returns array of chunks, each ≤ maxChars
}
```

The `maxChars` default of 12,000 (~3,000 tokens) is conservative enough for all providers. This leaves room for system prompt + output tokens within typical 8K-200K context windows.

### 2. Add a `MAX_LLM_INPUT_CHARS` constant (default 12,000)

When `content.length > MAX_LLM_INPUT_CHARS`, chunk the content and call the LLM once per chunk, then merge the wiki page outputs. For merging:
- First chunk produces the primary page (title, summary, key facts)
- Subsequent chunks produce supplemental content with a prompt like "Continue adding to a wiki article about X. Here is additional source material:"
- Concatenate all LLM outputs into a single page

### 3. Update `ingest()` to use chunking

In the main `ingest()` function, replace the single `callLLM()` call with:
- If content fits in one chunk: single call (no behavior change)
- If content needs multiple chunks: call LLM per chunk, merge results

### 4. Make `maxOutputTokens` configurable in `llm.ts`

Add an optional `maxTokens` parameter to `callLLM()` and `callLLMStream()` so callers can request more output for longer sources. Default stays 4096.

### 5. Tests

Add tests in `src/lib/__tests__/ingest.test.ts`:
- `chunkText` with content shorter than limit → returns single chunk
- `chunkText` with content longer than limit → splits on paragraph boundaries
- `chunkText` with one giant paragraph → splits on sentence boundaries
- `chunkText` preserves all content (join(chunks) ≈ original)
- `ingest` with long content calls LLM multiple times (verify mock call count)

### Verify

```sh
pnpm build && pnpm lint && pnpm test
```

Update SCHEMA.md known gaps to remove the "no context window management" line.
