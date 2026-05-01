Title: Extract canvas rendering from useGraphSimulation into graph-render.ts
Files: src/lib/graph-render.ts, src/hooks/useGraphSimulation.ts, src/lib/__tests__/graph-render.test.ts
Issue: none

## Description

After task_01 extracts `stepPhysics`, the render step (lines ~119-245) is the next self-contained block in `useGraphSimulation.ts`. Extract it into `graph-render.ts` as a `renderGraph` function.

### What to extract

The entire render block — clear canvas, draw edges, draw nodes with cluster colors, draw tooltip, draw cluster legend — becomes:

```typescript
export interface RenderOptions {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  palette: ColorPalette;
  hovered: GraphNode | null;
  mouse: { x: number; y: number };
  clusterCount: number;
}

export function renderGraph(opts: RenderOptions): void {
  // Clear + fill background
  // Draw edges with thickness scaling
  // Draw nodes with cluster colors + hover highlight
  // Draw labels
  // Draw tooltip for hovered node
  // Draw cluster legend
}
```

In `useGraphSimulation.ts`, the `simulate` callback becomes roughly:

```typescript
const { totalVelocity } = stepPhysics(nodes, edges, nodeMap, cx, cy);

renderGraph({
  nodes, edges, nodeMap, ctx,
  width: W, height: H,
  palette, hovered: hoveredRef.current,
  mouse: mouseRef.current,
  clusterCount: clusterCountRef.current,
});

if (totalVelocity > VELOCITY_THRESHOLD) {
  animRef.current = requestAnimationFrame(simulate);
}
```

### Tests to add

Since `renderGraph` uses `CanvasRenderingContext2D` (browser API), tests should verify the function can be called without throwing by using a mock context. Add 2-3 lightweight tests:

- `renderGraph` with empty nodes/edges doesn't throw
- `renderGraph` calls `ctx.clearRect` and `ctx.fillRect` (verify with spy)
- `renderGraph` with a hovered node doesn't throw

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

After this task, `useGraphSimulation.ts` should shrink from ~406 lines (post task_01) to ~280 lines. The `simulate` callback goes from ~180 lines to ~15 lines. The hook is now focused on React lifecycle (data fetching, resize handling, mouse events, animation loop) while all pure logic lives in `graph-render.ts`.
