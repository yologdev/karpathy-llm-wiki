Title: Source URL tracking in frontmatter
Files: src/lib/ingest.ts, src/lib/types.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Description

Store the original source URL in wiki page frontmatter during URL-based ingest.
Currently `ingestUrl()` fetches content from a URL but the URL itself is lost — it
never reaches the frontmatter that `ingest()` writes. This blocks re-ingestion,
freshness tracking, and source provenance display.

### Changes

1. **`src/lib/ingest.ts`** — Add an optional `sourceUrl?: string` field to
   `IngestOptions`. In `ingestUrl()`, pass `{ ...options, sourceUrl: url }` through
   to `ingest()`. In `ingest()`, when `options?.sourceUrl` is set, add
   `source_url: options.sourceUrl` to the frontmatter object. On re-ingest (existing
   page), preserve the existing `source_url` if the new ingest doesn't provide one.

2. **`src/lib/types.ts`** — Add `sourceUrl?: string` to `IndexEntry` so the index
   can surface the original URL. In the `IngestResult` interface, add
   `sourceUrl?: string` so the API response includes it.

3. **`src/lib/__tests__/ingest.test.ts`** — Add tests verifying:
   - `ingestUrl()` produces frontmatter with `source_url` set to the original URL
   - Plain `ingest()` (text paste, no URL) does NOT add `source_url`
   - Re-ingesting the same slug preserves the original `source_url`

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must continue to pass. The new frontmatter field is additive and
backward-compatible — pages without `source_url` are fine.
