Title: Extract useGraphSimulation hook from graph page
Files: src/hooks/useGraphSimulation.ts, src/app/wiki/graph/page.tsx, src/lib/__tests__/graph-render.test.ts
Issue: none

## Description

The graph page at `src/app/wiki/graph/page.tsx` is 488 lines — the largest page component
in the project. It mixes data fetching, physics simulation, canvas rendering, event handling,
and JSX in a single component. Extract the non-UI logic into a custom hook.

### New file: `src/hooks/useGraphSimulation.ts`

Create a `useGraphSimulation` hook that encapsulates:

1. **Data fetching** — the `useEffect` that fetches `/api/wiki/graph`, initializes node
   positions, runs community detection, and populates `dataRef`/`nodeMapRef`
2. **Color scheme detection** — the `useEffect` that watches `prefers-color-scheme` and
   updates `paletteRef`
3. **Physics simulation + rendering** — the `simulate` callback (physics step + canvas
   drawing + legend + tooltip)
4. **Canvas resize handling** — the `useEffect` with `resizeCanvas`
5. **Event handlers** — `handleMouseMove`, `handleMouseLeave`, `handleClick`

The hook should accept a `canvasRef: RefObject<HTMLCanvasElement | null>` and a
`router` (from `useRouter`) and return:
```ts
{
  loading: boolean;
  empty: boolean;
  fetchError: string | null;
  canvasBg: string;
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseLeave: () => void;
  handleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}
```

### Modified file: `src/app/wiki/graph/page.tsx`

Replace the inline state/effects/handlers with a single call to `useGraphSimulation`.
The component should shrink to ~60-80 lines: imports, the hook call, conditional renders
for loading/error/empty, and the final canvas JSX.

### Verification
```sh
pnpm build && pnpm lint && pnpm test
```

The graph page has no dedicated tests (it's a visual canvas component), so this is a
pure refactor verified by build + lint passing. The existing `graph-render.test.ts` tests
the helper functions which remain unchanged.
