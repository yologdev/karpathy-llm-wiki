Title: Migrate API routes to structured logger (batch 1: ingest + lint)
Files: src/app/api/ingest/route.ts, src/app/api/ingest/reingest/route.ts, src/app/api/ingest/batch/route.ts, src/app/api/lint/route.ts, src/app/api/lint/fix/route.ts
Issue: none

## Context

The project has a structured logger module (`src/lib/logger.ts`) with configurable log levels and tag-based filtering, but 10 API routes still use raw `console.error`. This means API errors bypass the LOG_LEVEL setting and don't appear in structured log output. This is batch 1 covering the ingest and lint API routes (5 files).

## The logger API

```ts
import { logger } from "@/lib/logger";

// Usage:
logger.error("tag", "message", optionalData);
logger.warn("tag", "message");
logger.info("tag", "message");
```

Check `src/lib/logger.ts` for the exact interface before starting.

## Changes

For each of these 5 files, replace `console.error(...)` with the appropriate `logger.error(...)` call:

### 1. `src/app/api/ingest/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Ingest error:", error);` → `logger.error("ingest", "Ingest error", error);`

### 2. `src/app/api/ingest/reingest/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Re-ingest error:", error);` → `logger.error("ingest", "Re-ingest error", error);`

### 3. `src/app/api/ingest/batch/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Batch ingest error:", error);` → `logger.error("ingest", "Batch ingest error", error);`

### 4. `src/app/api/lint/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Lint error:", error);` → `logger.error("lint", "Lint error", error);`

### 5. `src/app/api/lint/fix/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Lint fix error:", error);` → `logger.error("lint", "Lint fix error", error);`

## Notes

- Read `src/lib/logger.ts` first to confirm the exact API signature
- Tags should match the domain: "ingest" for ingest routes, "lint" for lint routes
- Keep the error object as the third argument so it gets logged as structured data
- Don't change `console.log` or `console.warn` calls if any exist — only `console.error`
- The 2 component files (`WikiIndexClient.tsx`, `QueryResultPanel.tsx`) also use `console.error` but those are client-side and the logger is server-only, so leave them alone

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All tests must pass. These are simple import + string changes with no behavioral impact.
