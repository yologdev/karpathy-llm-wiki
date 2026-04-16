Title: Split wiki graph page — extract force-sim + draw helpers into src/lib/graph-render.ts
Files: src/lib/graph-render.ts (new), src/app/wiki/graph/page.tsx, src/lib/__tests__/graph-render.test.ts (new, optional small)
Issue: none

## Goal

`src/app/wiki/graph/page.tsx` is the largest file in the repo at 598 lines. Most of it is non-React: a `roundedRect` helper, color palettes, physics constants, and a `nodeRadius` function. Extracting these into a module will bring the component body closer to the ~200-line target and make the non-React logic testable.

## What to do

1. Create `src/lib/graph-render.ts` and move:
   - `roundedRect()` (lines ~19-37 currently)
   - `ColorPalette` interface
   - `DARK_PALETTE`, `LIGHT_PALETTE` constants
   - `getColorPalette()` function
   - `CLUSTER_COLORS_DARK`, `CLUSTER_COLORS_LIGHT`, `CLUSTER_STROKES_DARK`, `CLUSTER_STROKES_LIGHT` arrays
   - Physics constants: `REPULSION`, `ATTRACTION`, `CENTER_GRAVITY`, `DAMPING`, `VELOCITY_THRESHOLD`
   - Node sizing constants: `BASE_RADIUS`, `RADIUS_SCALE`, `MIN_RADIUS`, `MAX_RADIUS`
   - `nodeRadius()` function

   Export everything the page needs.

2. Also move `GraphNode`, `GraphEdge`, `GraphData` interfaces into `src/lib/graph-render.ts` as exported types — they're pure data shapes.

3. In `src/app/wiki/graph/page.tsx`, import from `@/lib/graph-render` and delete the moved code.

4. `getColorPalette()` currently reads from `document` / `window`. Since `graph-render.ts` is imported by a client component ("use client" is in page.tsx), this is still fine — but make sure `graph-render.ts` is not marked as a server-only module. Just plain functions that happen to touch `document` when called are OK; the module itself is environment-neutral.

5. Verify: `pnpm build && pnpm lint && pnpm test`. Page should drop to ~450 lines or fewer. The graph page must still render and behave identically — open it in dev if uncertain, but the build+lint+test gate is sufficient.

## Constraints

- Pure refactor — NO behavior changes, no physics tweaks, no color changes.
- Do NOT touch the force-sim loop, `useEffect` hooks, tooltip logic, or event handlers — those stay in the page.
- Do NOT change the React component's public behavior.
- At most 3 files touched.

## Out of scope

- Splitting the force-sim loop itself into a hook (`useForceSimulation`) — larger change, separate task.
- Extracting the tooltip into its own component.
- Tests for the extracted module (optional; add a tiny smoke test for `nodeRadius` only if time permits).
