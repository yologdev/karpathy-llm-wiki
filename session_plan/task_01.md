Title: Graph page per-frame performance fixes
Files: src/app/wiki/graph/page.tsx
Issue: none

## Problem

The `simulate()` callback in the graph page has two per-frame performance issues:

1. **`nodeMap` recreated every frame** (line 232): `new Map(nodes.map(...))` allocates a new Map on every animation frame. The node set doesn't change between frames — only positions/velocities do. Build the map once when data changes, store it in a ref.

2. **`matchMedia` queried every frame** (line 305): `window.matchMedia("(prefers-color-scheme: dark)").matches` is called inside the render loop on every frame to pick cluster colors. The theme doesn't change between frames. The palette is already tracked via `paletteRef` and the `mql` listener (line 199) — use that instead of re-querying.

## Implementation

### Fix 1: Hoist `nodeMap` out of `simulate()`

- Create a `nodeMapRef = useRef<Map<string, GraphNode>>(new Map())` alongside existing refs
- When `dataRef.current` is set (in the data-loading effect or wherever nodes are populated), also rebuild `nodeMapRef.current = new Map(nodes.map(n => [n.id, n]))`
- In `simulate()`, read `const nodeMap = nodeMapRef.current` instead of rebuilding

### Fix 2: Eliminate per-frame `matchMedia` for cluster colors

- The `paletteRef` is already updated when the color scheme changes (via the `mql` listener at line 199). Add a `isDarkRef` or compute dark/light from the existing `paletteRef` value.
- In the simulate/render section around line 305, replace the `matchMedia` call with a check against `paletteRef.current` (e.g., `const isDark = paletteRef.current === DARK_PALETTE` or compare `paletteRef.current.bg`).
- This way, cluster color arrays are selected without a DOM query every frame.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The graph page has no unit tests (canvas rendering), so verify it compiles cleanly and the logic is correct by code review. Ensure the `nodeMap` is still correct for edge lookups and the cluster colors still react to theme changes.
