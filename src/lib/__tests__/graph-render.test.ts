import { describe, it, expect } from "vitest";
import {
  nodeRadius,
  MIN_RADIUS,
  MAX_RADIUS,
  getColorPalette,
  DARK_PALETTE,
  stepPhysics,
  type GraphNode,
  type GraphEdge,
} from "../graph-render";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    label: overrides.id,
    linkCount: 1,
    tags: [],
    cluster: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ...overrides,
  };
}

describe("graph-render", () => {
  describe("nodeRadius", () => {
    it("returns MIN_RADIUS for nodes with no links", () => {
      expect(nodeRadius(0)).toBe(MIN_RADIUS);
    });

    it("grows with link count", () => {
      expect(nodeRadius(4)).toBeGreaterThan(nodeRadius(1));
      expect(nodeRadius(10)).toBeGreaterThan(nodeRadius(4));
    });

    it("never exceeds MAX_RADIUS", () => {
      expect(nodeRadius(1000)).toBe(MAX_RADIUS);
      expect(nodeRadius(10_000)).toBe(MAX_RADIUS);
    });
  });

  describe("getColorPalette", () => {
    it("returns DARK_PALETTE when window is undefined (SSR)", () => {
      // vitest runs in node by default, so window is undefined here
      expect(getColorPalette()).toBe(DARK_PALETTE);
    });
  });

  describe("stepPhysics", () => {
    it("two overlapping nodes produces repulsion (nodes move apart)", () => {
      const a = makeNode({ id: "a", x: 100, y: 100 });
      const b = makeNode({ id: "b", x: 101, y: 100 });
      const nodes = [a, b];
      const edges: GraphEdge[] = [];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      stepPhysics(nodes, edges, nodeMap, 100, 100);

      // After repulsion, nodes should have moved apart on the x axis
      expect(a.x).toBeLessThan(100);
      expect(b.x).toBeGreaterThan(101);
    });

    it("connected distant nodes produces attraction (nodes move closer)", () => {
      const a = makeNode({ id: "a", x: 0, y: 200 });
      const b = makeNode({ id: "b", x: 400, y: 200 });
      const nodes = [a, b];
      const edges: GraphEdge[] = [{ source: "a", target: "b" }];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Run several steps so attraction can dominate over repulsion at distance
      for (let i = 0; i < 50; i++) {
        stepPhysics(nodes, edges, nodeMap, 200, 200);
      }

      // Nodes should be closer together than they started
      const dist = Math.abs(a.x - b.x);
      expect(dist).toBeLessThan(400);
    });

    it("returns totalVelocity > 0 when nodes have forces, approaches 0 over many iterations", () => {
      const a = makeNode({ id: "a", x: 100, y: 100 });
      const b = makeNode({ id: "b", x: 102, y: 100 });
      const nodes = [a, b];
      const edges: GraphEdge[] = [{ source: "a", target: "b" }];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // First step should have non-zero velocity
      const first = stepPhysics(nodes, edges, nodeMap, 100, 100);
      expect(first.totalVelocity).toBeGreaterThan(0);

      // Run many iterations — system should settle
      let last = first;
      for (let i = 0; i < 500; i++) {
        last = stepPhysics(nodes, edges, nodeMap, 100, 100);
      }
      expect(last.totalVelocity).toBeLessThan(first.totalVelocity);
      expect(last.totalVelocity).toBeLessThan(1);
    });

    it("single node applies center gravity (node drifts toward center)", () => {
      const node = makeNode({ id: "solo", x: 300, y: 300 });
      const nodes = [node];
      const edges: GraphEdge[] = [];
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const cx = 100;
      const cy = 100;

      for (let i = 0; i < 100; i++) {
        stepPhysics(nodes, edges, nodeMap, cx, cy);
      }

      // Node should have drifted toward (cx, cy)
      expect(Math.abs(node.x - cx)).toBeLessThan(200);
      expect(Math.abs(node.y - cy)).toBeLessThan(200);
      // More specifically, it should be much closer than the starting 300
      expect(Math.abs(node.x - cx)).toBeLessThan(50);
      expect(Math.abs(node.y - cy)).toBeLessThan(50);
    });
  });
});
