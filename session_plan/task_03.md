Title: Migrate API routes to structured logger (batch 2: query + wiki)
Files: src/app/api/query/route.ts, src/app/api/query/save/route.ts, src/app/api/query/history/route.ts, src/app/api/query/stream/route.ts, src/app/api/wiki/graph/route.ts
Issue: none

## Context

Continuation of the logger migration. Batch 1 (task 02) covers ingest + lint routes. This batch covers the remaining 5 API routes that still use `console.error`: query routes (4 files) and the wiki graph route (1 file).

## The logger API

```ts
import { logger } from "@/lib/logger";
logger.error("tag", "message", optionalData);
```

Check `src/lib/logger.ts` for the exact interface.

## Changes

### 1. `src/app/api/query/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Query error:", error);` → `logger.error("query", "Query error", error);`

### 2. `src/app/api/query/save/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Save answer error:", error);` → `logger.error("query", "Save answer error", error);`

### 3. `src/app/api/query/history/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Query history GET error:", error);` → `logger.error("query", "Query history GET error", error);`
- Replace: `console.error("Query history POST error:", error);` → `logger.error("query", "Query history POST error", error);`

### 4. `src/app/api/query/stream/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Query stream error:", error);` → `logger.error("query", "Query stream error", error);`

### 5. `src/app/api/wiki/graph/route.ts`
- Add: `import { logger } from "@/lib/logger";`
- Replace: `console.error("Graph API error:", error);` → `logger.error("wiki", "Graph API error", error);`

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

After this task, there should be ZERO `console.error` calls in `src/app/api/`. Verify with:
```bash
grep -rn 'console\.error' src/app/api/ --include='*.ts'
```

The only remaining `console.error` calls should be in client components (`WikiIndexClient.tsx`, `QueryResultPanel.tsx`) which is correct since the logger is server-only.
