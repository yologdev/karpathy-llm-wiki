Title: Interactive wiki graph view
Files: src/app/wiki/graph/page.tsx, src/app/api/wiki/graph/route.ts, src/components/NavHeader.tsx

Issue: none

## Description

The founding vision mentions browsing the wiki with a "graph view" (like Obsidian's). The journal has named this repeatedly as a next step. Currently browse is a flat list only. This task adds an interactive force-directed graph showing wiki pages as nodes and cross-references as edges.

### What to build

**1. Graph data API: `src/app/api/wiki/graph/route.ts`**

A GET endpoint that returns JSON with nodes and edges:

```typescript
interface GraphNode {
  id: string;      // slug
  label: string;   // title
}

interface GraphEdge {
  source: string;  // slug of page containing the link
  target: string;  // slug of the linked page
}

// Response: { nodes: GraphNode[], edges: GraphEdge[] }
```

Implementation:
- Use `listWikiPages()` to get all pages as nodes
- For each page, use `readWikiPage()` and parse markdown links `[text](slug.md)` to find edges
- Return the JSON structure

**2. Graph visualization: `src/app/wiki/graph/page.tsx`**

A client component that renders an interactive force-directed graph using **Canvas 2D** — no external library needed. This keeps the dependency count at zero and the bundle small.

Implementation approach:
- Fetch `/api/wiki/graph` on mount
- Implement a simple force-directed layout algorithm:
  - Repulsion force between all nodes (Coulomb's law)
  - Attraction force along edges (Hooke's law / spring)
  - Center gravity to keep graph from drifting
  - Damping to settle the simulation
- Render on a `<canvas>` element using `requestAnimationFrame`
- Draw nodes as circles with labels, edges as lines
- **Interaction**: click on a node to navigate to `/wiki/[slug]`
- Use `useRef` for the canvas, `useEffect` for the simulation loop
- Style: dark background (#0a0a0a), light nodes, colored edges
- Handle empty state (no pages yet) with a friendly message

Keep the physics simple — ~50 lines of simulation code is enough for a pleasing result. Don't over-engineer.

**3. Add navigation link in `src/components/NavHeader.tsx`**

Add a "Graph" link to the nav header, between "Browse" and "Query" (or after Browse). Route: `/wiki/graph`.

### Design constraints

- **No new npm dependencies.** Canvas 2D is built into browsers.
- The graph page should be a `"use client"` component.
- The API route is a server-side GET handler.
- The simulation should auto-stop after settling (when total velocity drops below a threshold).
- Canvas should be responsive (fill available width, reasonable height like 500-600px).

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Build and lint must pass. No new tests required for this visual component, but the API route should return valid JSON structure.
