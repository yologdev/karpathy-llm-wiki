Title: Fix graph rendering bugs (DPR scale accumulation + theme mismatch)
Files: src/app/wiki/graph/page.tsx, src/lib/graph-render.ts
Issue: none

## Problem

Two confirmed bugs in the graph view:

### Bug 1: DPR scale accumulation on resize
In `src/app/wiki/graph/page.tsx` line ~345-346, the `resizeCanvas` handler calls
`ctx.scale(dpr, dpr)` without first resetting the canvas transform. Since canvas
transforms are cumulative, each window resize event doubles the scale factor,
causing progressively blurry/broken rendering.

**Fix:** Add `ctx.setTransform(1, 0, 0, 1, 0, 0)` before `ctx.scale(dpr, dpr)`.

### Bug 2: Graph palette ignores app theme
In `src/lib/graph-render.ts` line ~64-68, `getColorPalette()` checks
`window.matchMedia("(prefers-color-scheme: dark)")` instead of reading the `.dark`
class on `<html>` that the app's ThemeToggle actually manages. When a user manually
overrides OS theme via the toggle, the graph renders with wrong colors.

**Fix:** Change `getColorPalette()` to check `document.documentElement.classList.contains("dark")` instead of the media query. Fall back to the media query only if the classList approach doesn't give a clear answer (SSR safety).

### Verification
- `pnpm build && pnpm lint && pnpm test`
- Confirm graph-render.test.ts still passes (if it exists; check first)
