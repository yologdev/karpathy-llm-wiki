Title: Add pre-stream retry to callLLMStream
Files: src/lib/llm.ts, src/lib/__tests__/llm.test.ts
Issue: none

## Description

`callLLM` retries transient failures via `retryWithBackoff`, but `callLLMStream` has a TODO noting that streaming retries need different handling. The concern is that once a stream has emitted partial data to the client, retrying would produce duplicate/garbled output.

The pragmatic solution: retry the `streamText()` call itself *before* any data reaches the client. If the initial connection fails (network error, 429, 503), retry with backoff. Once the stream starts successfully emitting tokens, no further retries — the stream is committed. This handles the most common failure mode (connection refused, rate limit on first request) without the complexity of mid-stream recovery.

## Changes

### 1. Update `callLLMStream` in `src/lib/llm.ts`

Replace the current implementation with one that wraps the `streamText()` call in `retryWithBackoff`:

```typescript
export async function callLLMStream(
  systemPrompt: string,
  userMessage: string,
  options?: { maxOutputTokens?: number },
) {
  const model = getModel();

  // Retry the initial stream creation. Once streamText() returns successfully,
  // the connection is established and we commit to this stream — no mid-stream
  // retries (that would require buffering and client reconnection).
  return retryWithBackoff(() =>
    streamText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: options?.maxOutputTokens ?? 4096,
    }),
  );
}
```

**Important:** Note the function signature changes from sync to async (returns `Promise<StreamTextResult>` instead of `StreamTextResult`). Update the call site in `src/app/api/query/stream/route.ts` to `await callLLMStream(...)`.

Wait — actually check if `streamText` throws on connection failure or only fails when you consume the stream. If `streamText` returns immediately and errors surface on stream consumption, the retry wrapper wouldn't help. In that case, document this in the TODO comment and skip the retry (don't ship a false sense of safety).

Research the Vercel AI SDK `streamText` behavior:
- If it throws synchronously/rejects the promise on connection errors → wrap in retryWithBackoff
- If it returns a stream object that errors on read → leave the TODO, add a comment explaining why pre-stream retry doesn't help

### 2. Update call site in `src/app/api/query/stream/route.ts`

If the function becomes async, change:
```typescript
const result = callLLMStream(systemPrompt, trimmedQuestion);
```
to:
```typescript
const result = await callLLMStream(systemPrompt, trimmedQuestion);
```

### 3. Add/update tests in `src/lib/__tests__/llm.test.ts`

Add tests for the streaming retry behavior:
- If `streamText` throws a retryable error on first call, verify it retries and succeeds
- If `streamText` throws a non-retryable error, verify it throws immediately
- Verify the returned result is the stream object from the successful call

Use the same mocking patterns as the existing `callLLM` retry tests in this file.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Ensure no type errors from the sync→async change and that all existing + new tests pass.
