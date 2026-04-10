Title: Make graph view theme-aware (support light and dark mode)
Files: src/app/wiki/graph/page.tsx
Issue: none

## Problem

The wiki graph view renders on an HTML `<canvas>` with hardcoded dark-theme colors:
- Background: `#0a0a0a` (near-black)
- Edges: `#4a5568` (gray-600)
- Nodes: `#60a5fa` (blue-400)
- Node stroke: `#93c5fd` (blue-300)
- Labels: `#e2e8f0` (gray-200)

Since these are canvas API calls (`ctx.fillStyle`, `ctx.strokeStyle`), they can't use Tailwind classes. Users on light mode see a jarring dark rectangle.

## Fix

Use `window.getComputedStyle()` or `window.matchMedia('(prefers-color-scheme: dark)')` to detect the current color scheme, then select appropriate colors.

Implementation approach:

1. Define two color palettes (light and dark):
   ```
   Dark:  bg=#0a0a0a  edge=#4a5568  node=#60a5fa  nodeStroke=#93c5fd  label=#e2e8f0
   Light: bg=#ffffff  edge=#cbd5e1  node=#3b82f6  nodeStroke=#2563eb  label=#1e293b
   ```

2. At the top of the `simulate` function (or in a `useEffect`), detect the color scheme:
   ```typescript
   const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
   ```
   
   Also check if Next.js / the app uses a `class="dark"` on `<html>` (check `document.documentElement.classList.contains('dark')`). Use whichever detection method the app already uses — check `layout.tsx` and `globals.css` to see if there's a dark mode class toggle.

3. Select the palette based on `isDark` and use it in the canvas rendering calls.

4. Listen for changes: add a `matchMedia` change listener so the graph re-renders if the user toggles their system theme. Clean up the listener on unmount.

5. Also set the `<canvas>` element's CSS background to match (via inline style or className) so there's no flash of wrong color before the first render.

## Key constraints

- Only modify graph/page.tsx (1 file)
- Keep the existing force simulation logic unchanged
- Make sure the component still works in SSR (guard `window` access with `typeof window !== 'undefined'` or only access in useEffect)

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

Build must pass. Visually, the canvas should use light colors on light backgrounds and dark colors on dark backgrounds.
