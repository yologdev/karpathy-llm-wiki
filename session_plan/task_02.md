Title: Add X-mention integration test for route→library→wiki chain
Files: src/lib/__tests__/x-mention-integration.test.ts
Issue: none

## Description

The assessment notes: "No test for the actual X-mention end-to-end path. The unit
tests for `ingestXMention` mock the LLM and fetch layers, but there's no integration
test verifying the route→library→wiki write chain works together for X mentions."

Add an integration test that exercises the POST /api/ingest/x-mention route handler
end-to-end (with mocked LLM and fetch, but real filesystem wiki writes) to verify:

1. A valid X-mention request creates a wiki page with correct frontmatter:
   - `sources[].type` is "x-mention"
   - `sources[].triggered_by` is the mentioning handle
   - `authors` includes "yoyo" (or whichever agent processed it)
2. The response includes the created page slug and metadata
3. Invalid requests (missing URL, missing handle) return appropriate errors
4. If the source URL can't be fetched, it handles gracefully

### Implementation approach

Look at existing integration tests (e.g., `src/lib/__tests__/integration.test.ts`)
for the pattern of:
- Creating a temp directory for DATA_DIR/WIKI_DIR
- Mocking the LLM via vi.mock
- Mocking fetch for URL fetching
- Calling the library function directly (not HTTP, to avoid Next.js server boot)

Since `ingestXMention` is the library function and the route is just a thin wrapper,
test the library function with real filesystem writes. This validates the chain
from ingest to wiki page creation.

### What to verify in the test

```typescript
describe("X-mention integration", () => {
  it("creates wiki page with x-mention source provenance", async () => {
    // Mock LLM to return a simple summary + title
    // Mock fetch to return article content from the URL
    // Call ingestXMention({ url, mentionedBy, platform: "x" })
    // Verify: wiki page exists with correct frontmatter
    // Verify: sources[] has entry with type: "x-mention", triggered_by: handle
  });

  it("handles fetch failure gracefully", async () => {
    // Mock fetch to throw/404
    // Verify: appropriate error or empty result
  });
});
```

### Verification

```sh
pnpm build && pnpm test -- --run src/lib/__tests__/x-mention-integration.test.ts
```
