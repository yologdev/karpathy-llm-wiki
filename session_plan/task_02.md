Title: sources[] structured provenance — data layer with tests
Files: src/lib/types.ts, src/lib/ingest.ts, src/lib/__tests__/ingest.test.ts, src/lib/__tests__/frontmatter.test.ts
Issue: none

The yopedia Phase 1 roadmap defines `sources[]` as an array of
`{type, url, fetched, triggered_by}` objects for structured provenance. The
codebase currently uses a flat `source_url` string. This is the biggest
remaining Phase 1 gap.

**Design decision:** The frontmatter parser intentionally rejects nested
objects, and extending it to support arbitrary YAML nesting is risky. Instead,
store `sources` as a JSON-encoded string in frontmatter. Helper functions
parse it on read and serialize it on write. This keeps the frontmatter parser
simple while giving us structured provenance.

**What to build:**

1. **Source interface** in `src/lib/types.ts`:
   ```ts
   export interface SourceEntry {
     type: 'url' | 'text' | 'x-mention';  // provenance type
     url: string;                           // source URL or "text-paste"
     fetched: string;                       // ISO date of fetch
     triggered_by: string;                  // who triggered (user handle or "system")
   }
   ```

2. **Helper functions** in a new `src/lib/sources.ts` (or in types.ts):
   - `serializeSources(sources: SourceEntry[]): string` — JSON.stringify
   - `parseSources(raw: string | string[]): SourceEntry[]` — JSON.parse with
     validation, returns `[]` on invalid input
   - `buildSourceEntry(url: string, type: string, triggeredBy?: string): SourceEntry`

3. **Ingest pipeline update** in `src/lib/ingest.ts`:
   - On new ingest: build a `SourceEntry` from the URL/text, serialize to
     `sources` frontmatter field. Keep `source_url` for backward compat.
   - On re-ingest: parse existing `sources`, append new entry (or update
     the existing one with new `fetched` date), re-serialize.

4. **Tests:**
   - Unit tests for `parseSources` / `serializeSources` (valid JSON, invalid
     JSON, empty, malformed entries)
   - Update existing ingest tests to verify `sources` field is populated

**What NOT to do:**
- Don't change the frontmatter parser itself
- Don't remove `source_url` (backward compat)
- Don't add UI display (that's task_03)

**Verification:** `pnpm build && pnpm lint && pnpm test`
