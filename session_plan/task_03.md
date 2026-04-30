Title: Replace stray console.error calls with structured logger
Files: src/components/WikiIndexClient.tsx, src/components/QueryResultPanel.tsx
Issue: none

## Goal

Two components still use raw `console.error` instead of the structured logger:
- `src/components/WikiIndexClient.tsx:51` — `console.error("Export failed:", err)`
- `src/components/QueryResultPanel.tsx:57` — `console.error("[query] copy failed:", err)`

Replace both with `logger.error(...)` from `@/lib/logger`. This completes the structured-logger migration that was started in session ~50 for API routes.

## Changes

### `src/components/WikiIndexClient.tsx`
1. Add import: `import { logger } from "@/lib/logger";`
2. Replace `console.error("Export failed:", err)` with `logger.error("Export failed:", err)`

### `src/components/QueryResultPanel.tsx`
1. Add import: `import { logger } from "@/lib/logger";`
2. Replace `console.error("[query] copy failed:", err)` with `logger.error("[query] copy failed:", err)`

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

After this change, verify no stray console.error/console.log/console.warn remain in production code:
```sh
grep -rn 'console\.\(log\|error\|warn\)' src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v node_modules
```

Should return zero results (or only test files).
