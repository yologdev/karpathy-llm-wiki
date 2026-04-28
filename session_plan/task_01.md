Title: Clean up ingest.ts re-export façade
Files: src/lib/ingest.ts, src/lib/query.ts, src/lib/__tests__/ingest.test.ts
Issue: none

## Context

`ingest.ts` has accumulated ~20 re-exports from modules extracted in prior sessions (`slugify`, `loadPageConventions`, `isUrl`, `stripHtml`, `extractTitle`, `extractWithReadability`, `htmlToMarkdown`, `validateUrlSafety`, `fetchUrlContent`, `downloadImages`, `findRelatedPages`, `updateRelatedPages`, `MAX_LLM_INPUT_CHARS`). This was done to keep old import paths working, but it creates a dependency web where importing anything from `ingest` pulls in everything.

## Analysis of actual external callers

After grepping all non-test source files, here's what actually imports re-exported symbols from `ingest`:

| Symbol | External callers | Source module |
|--------|-----------------|---------------|
| `findRelatedPages` | **none** | `./wiki` (via `./search`) |
| `updateRelatedPages` | **none** | `./wiki` (via `./search`) |
| `loadPageConventions` | **none** | `./schema` |
| `MAX_LLM_INPUT_CHARS` | **none** | `./constants` |
| `slugify` | `query.ts` | `./slugify` |
| `isUrl` | `api/ingest/route.ts`, `api/ingest/batch/route.ts` | `./fetch` |
| `stripHtml` | **none** (only via ingest.test.ts) | `./fetch` |
| `extractTitle` | **none** (only via ingest.test.ts) | `./fetch` |
| `extractWithReadability` | **none** (only via ingest.test.ts) | `./fetch` |
| `htmlToMarkdown` | **none** (only via ingest.test.ts) | `./fetch` |
| `validateUrlSafety` | **none** (only via ingest.test.ts) | `./fetch` |
| `fetchUrlContent` | **none** (only via ingest.test.ts) | `./fetch` |
| `downloadImages` | **none** (only via ingest.test.ts) | `./fetch` |

Most re-exports have ZERO non-test callers. Only `slugify` (used in query.ts) and `isUrl` (used in 2 API routes) are actually used externally.

## Changes

### 1. `src/lib/ingest.ts` — Remove all re-export blocks

Remove these re-export lines:
- `export { findRelatedPages, updateRelatedPages } from "./wiki";` (line 24)
- `export { slugify } from "./slugify";` (line 27)
- `export { loadPageConventions } from "./schema";` (line 31)
- `export { isUrl, stripHtml, ... } from "./fetch";` (lines 35-45)
- `export { MAX_LLM_INPUT_CHARS } from "./constants";` (line 157)

Also remove the comment blocks explaining why they exist.

Keep the imports that `ingest.ts` itself uses internally (it still needs `slugify`, `findRelatedPages`, etc. for its own functions).

### 2. `src/lib/query.ts` — Update imports

Change:
```ts
import { slugify, extractSummary } from "./ingest";
```
To:
```ts
import { slugify } from "./slugify";
import { extractSummary } from "./ingest";
```

`extractSummary` is a real function defined in `ingest.ts`, not a re-export, so it stays.

### 3. `src/lib/__tests__/ingest.test.ts` — Update test imports

The test imports many re-exported symbols. Update to import from source modules:

Change the big import block to:
```ts
import { extractSummary, ingest, ingestUrl, reingest, buildIngestSystemPrompt, chunkText } from "../ingest";
import { slugify } from "../slugify";
import { loadPageConventions } from "../schema";
import { isUrl, stripHtml, extractTitle, extractWithReadability, fetchUrlContent, validateUrlSafety } from "../fetch";
import { findRelatedPages, updateRelatedPages } from "../search";
import { MAX_LLM_INPUT_CHARS } from "../constants";
```

Note: `findRelatedPages` and `updateRelatedPages` — check whether they're exported from `search.ts` or `wiki.ts`. The re-export in `ingest.ts` says `from "./wiki"` but they may have been re-exported through wiki from search. Trace the actual source.

Also need to update the `vi.mock("../fetch", ...)` block to ensure fetch module mocks are in place (they may already be mocked since `ingest.ts` imports from `fetch.ts`).

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All 1168 tests must still pass. The key risk is test imports — if any test was importing a re-exported symbol and the mock setup relied on the transitive import path, the mock may need adjustment.
