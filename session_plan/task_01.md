Title: Extract physics engine from useGraphSimulation into graph-render.ts
Files: src/lib/graph-render.ts, src/hooks/useGraphSimulation.ts, src/lib/__tests__/graph-render.test.ts
Issue: none

## Description

The `useGraphSimulation` hook at 451 lines is the largest remaining tech debt item. The physics step (repulsion, attraction, center gravity, damping, velocity integration — lines 72-117) is a pure function that takes nodes/edges and mutates positions. Extract it into `graph-render.ts` as a `stepPhysics` function.

### What to extract

From `useGraphSimulation.ts`, extract the physics step (lines ~72-117 of the `simulate` callback) into a pure function in `graph-render.ts`:

```typescript
export interface PhysicsResult {
  totalVelocity: number;
}

export function stepPhysics(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  cx: number,
  cy: number,
): PhysicsResult {
  // Repulsion between all pairs
  // Attraction along edges
  // Center gravity + damping + apply
  // Returns { totalVelocity }
}
```

Then in `useGraphSimulation.ts`, replace the inline physics code with:
```typescript
const { totalVelocity } = stepPhysics(nodes, edges, nodeMap, cx, cy);
```

And use `totalVelocity` in the "Continue or stop" check instead of `totalV`.

### Tests to add in `graph-render.test.ts`

- `stepPhysics` with two overlapping nodes produces repulsion (nodes move apart)
- `stepPhysics` with connected distant nodes produces attraction (nodes move closer)
- `stepPhysics` returns totalVelocity > 0 when nodes have forces, approaches 0 over many iterations
- `stepPhysics` with single node applies center gravity (node drifts toward center)

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The hook should shrink by ~45 lines and `graph-render.ts` should grow by ~55 lines (function + types). The hook stays at ~406 lines — still large, but the physics is now independently testable.
