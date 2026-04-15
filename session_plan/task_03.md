Title: Fix Safari roundRect, lint page React keys, and pageCache race
Files: src/app/wiki/graph/page.tsx, src/app/lint/page.tsx, src/lib/wiki.ts
Issue: none

## Description

Fix three confirmed bugs from the assessment.

### Bug 1: `ctx.roundRect` not supported in Safari <16

In `src/app/wiki/graph/page.tsx`, lines 348 and 383 use `ctx.roundRect()` which is not available in Safari versions before 16. Add a polyfill/fallback.

Replace the two `ctx.roundRect(...)` calls with a helper function that checks for `roundRect` support and falls back to manual `moveTo`/`arcTo`/`lineTo` path drawing:

```typescript
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Manual fallback for Safari <16
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
```

Then replace:
- `ctx.roundRect(tipX, tipY, tipW, tipH, 5);` → `roundedRect(ctx, tipX, tipY, tipW, tipH, 5);`
- `ctx.roundRect(legendX, legendY, legendW, legendH, 5);` → `roundedRect(ctx, legendX, legendY, legendW, legendH, 5);`

Also remove the preceding `ctx.beginPath()` calls since `roundedRect` handles that internally.

### Bug 2: Lint page React keys use array index

In `src/app/lint/page.tsx`, line 340 uses `key={`${issue.slug}-${issue.type}-${i}`}`. When issues are removed from the middle of the array after a fix, array indices shift and React mismatches components.

Fix: Generate a stable key from the issue's identifying fields. Use `key={`${issue.slug}-${issue.type}-${issue.message.slice(0, 40)}`}` — the combination of slug + type + message prefix is unique enough for lint issues and stable across array mutations.

### Bug 3: Module-level `pageCache` race condition

In `src/lib/wiki.ts`, the `pageCache` variable is a module-level `Map` shared across all concurrent requests. If two requests call `beginPageCache()` concurrently, the second one replaces the cache the first one is using, and when either cleanup runs, it nulls out the other's cache.

Fix: Replace the single module-level `Map` with a reference-counted approach. Use a counter instead of a nullable Map:

```typescript
let pageCache: Map<string, WikiPage | null> | null = null;
let pageCacheRefCount = 0;

export function beginPageCache(): () => void {
  if (pageCacheRefCount === 0) {
    pageCache = new Map();
  }
  pageCacheRefCount++;
  return () => {
    pageCacheRefCount--;
    if (pageCacheRefCount <= 0) {
      pageCache = null;
      pageCacheRefCount = 0;
    }
  };
}
```

This way multiple concurrent operations can share the same cache, and it's only cleaned up when the last user releases it.

Update `_getPageCacheSize` to remain unchanged (it already reads from `pageCache`).

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

All 606 existing tests must pass. Check that `_getPageCacheSize` tests still work correctly.
