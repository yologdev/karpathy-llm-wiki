import { describe, it, expect } from "vitest";
import { detectCommunities, ClusterInput } from "../graph";

describe("detectCommunities", () => {
  it("returns empty clusters for an empty graph", () => {
    const result = detectCommunities({ nodes: [], edges: [] });
    expect(result.clusters.size).toBe(0);
    expect(result.count).toBe(0);
  });

  it("assigns a single node to one cluster", () => {
    const result = detectCommunities({ nodes: ["a"], edges: [] });
    expect(result.clusters.size).toBe(1);
    expect(result.count).toBe(1);
    expect(result.clusters.get("a")).toBe(0);
  });

  it("detects two disconnected components as separate clusters", () => {
    const input: ClusterInput = {
      nodes: ["a", "b", "c", "d"],
      edges: [
        ["a", "b"],
        ["c", "d"],
      ],
    };
    const result = detectCommunities(input);
    expect(result.count).toBe(2);
    // Nodes in same component share a cluster
    expect(result.clusters.get("a")).toBe(result.clusters.get("b"));
    expect(result.clusters.get("c")).toBe(result.clusters.get("d"));
    // Different components have different clusters
    expect(result.clusters.get("a")).not.toBe(result.clusters.get("c"));
  });

  it("assigns a fully connected graph to one cluster", () => {
    const input: ClusterInput = {
      nodes: ["a", "b", "c", "d"],
      edges: [
        ["a", "b"],
        ["a", "c"],
        ["a", "d"],
        ["b", "c"],
        ["b", "d"],
        ["c", "d"],
      ],
    };
    const result = detectCommunities(input);
    expect(result.count).toBe(1);
    for (const id of input.nodes) {
      expect(result.clusters.get(id)).toBe(0);
    }
  });

  it("assigns a chain graph to one cluster", () => {
    const input: ClusterInput = {
      nodes: ["a", "b", "c", "d", "e"],
      edges: [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["d", "e"],
      ],
    };
    const result = detectCommunities(input);
    expect(result.count).toBe(1);
  });

  it("keeps isolated nodes as singleton clusters", () => {
    const input: ClusterInput = {
      nodes: ["a", "b", "c"],
      edges: [["a", "b"]],
    };
    const result = detectCommunities(input);
    // a and b are connected → same cluster; c is isolated → different cluster
    expect(result.clusters.get("a")).toBe(result.clusters.get("b"));
    expect(result.clusters.get("c")).not.toBe(result.clusters.get("a"));
    expect(result.count).toBe(2);
  });

  it("detects two cliques connected by a bridge", () => {
    // Clique 1: {a, b, c} fully connected
    // Clique 2: {d, e, f} fully connected
    // Bridge: c-d
    const input: ClusterInput = {
      nodes: ["a", "b", "c", "d", "e", "f"],
      edges: [
        ["a", "b"],
        ["a", "c"],
        ["b", "c"],
        ["d", "e"],
        ["d", "f"],
        ["e", "f"],
        ["c", "d"], // bridge
      ],
    };
    const result = detectCommunities(input);

    // Label propagation with a bridge may or may not split —
    // structural invariant: nodes in the same clique share a cluster
    expect(result.clusters.get("a")).toBe(result.clusters.get("b"));
    expect(result.clusters.get("a")).toBe(result.clusters.get("c"));
    expect(result.clusters.get("d")).toBe(result.clusters.get("e"));
    expect(result.clusters.get("d")).toBe(result.clusters.get("f"));

    // At most 2 clusters
    expect(result.count).toBeLessThanOrEqual(2);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic across multiple runs", () => {
    const input: ClusterInput = {
      nodes: ["x", "y", "z", "w", "v"],
      edges: [
        ["x", "y"],
        ["y", "z"],
        ["w", "v"],
      ],
    };
    const r1 = detectCommunities(input);
    const r2 = detectCommunities(input);
    expect(r1.count).toBe(r2.count);
    for (const id of input.nodes) {
      expect(r1.clusters.get(id)).toBe(r2.clusters.get(id));
    }
  });

  it("ignores edges referencing unknown nodes", () => {
    const input: ClusterInput = {
      nodes: ["a", "b"],
      edges: [
        ["a", "b"],
        ["a", "unknown"],
      ],
    };
    const result = detectCommunities(input);
    expect(result.count).toBe(1);
    expect(result.clusters.get("a")).toBe(result.clusters.get("b"));
  });
});
