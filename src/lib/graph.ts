/**
 * Community detection for the wiki graph using label propagation.
 *
 * Label propagation is a simple, zero-dependency algorithm:
 * 1. Assign each node a unique label (its index).
 * 2. Iterate: for each node (deterministic order by ID), adopt the most
 *    common label among its neighbors. Ties break by smallest label.
 * 3. Repeat until convergence or max iterations.
 *
 * Deterministic ordering (sorted by node ID) avoids jarring color changes
 * on page refresh.
 */

export interface ClusterInput {
  nodes: string[]; // node IDs
  edges: [string, string][]; // pairs of connected node IDs
}

export interface ClusterResult {
  clusters: Map<string, number>; // node ID → cluster index (0-based)
  count: number; // number of distinct clusters
}

const MAX_ITERATIONS = 10;

export function detectCommunities(input: ClusterInput): ClusterResult {
  const { nodes, edges } = input;

  if (nodes.length === 0) {
    return { clusters: new Map(), count: 0 };
  }

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const id of nodes) {
    adj.set(id, []);
  }
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
  }

  // Assign initial labels: each node gets its own label
  const label = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    label.set(nodes[i], i);
  }

  // Deterministic iteration order: sorted by node ID for stability
  const sortedNodes = [...nodes].sort();

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    for (const id of sortedNodes) {
      const neighbors = adj.get(id)!;
      if (neighbors.length === 0) continue;

      // Count neighbor labels
      const counts = new Map<number, number>();
      for (const nb of neighbors) {
        const nbLabel = label.get(nb)!;
        counts.set(nbLabel, (counts.get(nbLabel) ?? 0) + 1);
      }

      // Find max count, break ties by smallest label
      let bestLabel = label.get(id)!;
      let bestCount = 0;
      for (const [lbl, cnt] of counts) {
        if (cnt > bestCount || (cnt === bestCount && lbl < bestLabel)) {
          bestLabel = lbl;
          bestCount = cnt;
        }
      }

      if (bestLabel !== label.get(id)!) {
        label.set(id, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Remap labels to contiguous 0-based cluster indices
  const labelToCluster = new Map<number, number>();
  const clusters = new Map<string, number>();
  let nextCluster = 0;

  // Assign cluster indices in sorted node order for determinism
  for (const id of sortedNodes) {
    const lbl = label.get(id)!;
    if (!labelToCluster.has(lbl)) {
      labelToCluster.set(lbl, nextCluster++);
    }
    clusters.set(id, labelToCluster.get(lbl)!);
  }

  return { clusters, count: nextCluster };
}
