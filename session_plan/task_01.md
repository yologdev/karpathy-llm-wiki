Title: Batch ingest API — multi-URL endpoint
Files: src/app/api/ingest/batch/route.ts, src/lib/__tests__/smoke.test.ts (verify build)
Issue: none

The founding vision (`llm-wiki.md`) explicitly calls for "batch-ingest many sources at once
with less supervision." Currently the app only supports one-at-a-time ingestion. This task
adds the **backend** for batch ingest — a new API route that accepts multiple URLs and
processes them sequentially, returning per-URL results with progress-friendly streaming.

### Implementation

Create `src/app/api/ingest/batch/route.ts`:

- **POST** endpoint accepting `{ urls: string[] }` (max 20 URLs per batch)
- Validate all URLs upfront (reject the batch if any are malformed)
- Process each URL sequentially using the existing `ingestUrl()` from `src/lib/ingest.ts`
- Use NDJSON streaming response (one JSON object per line as each URL completes) so the
  client can show progress. Each line: `{ index, url, success, result?, error? }`
- After all URLs are processed, the stream ends
- Wrap each individual ingest in try/catch so one failure doesn't abort the batch
- Import `ingestUrl` and `isUrl` from `@/lib/ingest` — no changes to the lib layer

The streaming approach uses `ReadableStream` with a `TextEncoder` to write NDJSON lines,
similar to how `/api/query/stream` works but simpler (no LLM streaming, just progress events).

### Why this scoping

Splitting batch ingest into API (task 1) and UI (task 2) keeps each task small and
independently testable. The API can be tested with curl even before the UI exists.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The route should compile and the build should produce a new `/api/ingest/batch` endpoint.
