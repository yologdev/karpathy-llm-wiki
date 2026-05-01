// Graph rendering helpers — pure data shapes, palettes, sizing, and canvas
// drawing primitives extracted from the wiki graph page so the React component
// can stay focused on hooks/event handlers and so this logic is testable in
// isolation. This module is environment-neutral: functions that touch
// `window`/`document` (like getColorPalette) only do so when invoked, so the
// module itself can be imported from either client or server code.

// --- Data shapes ---

export interface GraphNode {
  id: string;
  label: string;
  linkCount: number;
  tags: string[];
  cluster: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// --- Color palettes ---

export interface ColorPalette {
  bg: string;
  edge: string;
  node: string;
  nodeStroke: string;
  label: string;
  tooltip: string;
  tooltipBg: string;
}

export const DARK_PALETTE: ColorPalette = {
  bg: "#0a0a0a",
  edge: "#4a5568",
  node: "#60a5fa",
  nodeStroke: "#93c5fd",
  label: "#e2e8f0",
  tooltip: "#f1f5f9",
  tooltipBg: "rgba(30, 41, 59, 0.92)",
};

export const LIGHT_PALETTE: ColorPalette = {
  bg: "#ffffff",
  edge: "#cbd5e1",
  node: "#3b82f6",
  nodeStroke: "#2563eb",
  label: "#1e293b",
  tooltip: "#1e293b",
  tooltipBg: "rgba(248, 250, 252, 0.92)",
};

export function getColorPalette(): ColorPalette {
  if (typeof window === "undefined") return DARK_PALETTE;
  // Prefer the .dark class on <html> (managed by ThemeToggle) over the OS
  // media query so manual theme overrides are respected in the graph view.
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    if (html.classList.contains("dark")) return DARK_PALETTE;
    if (html.classList.contains("light")) return LIGHT_PALETTE;
  }
  // Fallback: OS-level preference (or dark by default)
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDark ? DARK_PALETTE : LIGHT_PALETTE;
}

// Cluster colors: distinct hues for community detection coloring
export const CLUSTER_COLORS_DARK = [
  "#60a5fa", // blue
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f87171", // rose
  "#a78bfa", // violet
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#a3e635", // lime
  "#f472b6", // pink
  "#2dd4bf", // teal
];

export const CLUSTER_COLORS_LIGHT = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // rose
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
  "#14b8a6", // teal
];

// Matching lighter stroke colors for dark mode
export const CLUSTER_STROKES_DARK = [
  "#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd",
  "#67e8f9", "#fdba74", "#bef264", "#f9a8d4", "#5eead4",
];

export const CLUSTER_STROKES_LIGHT = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#ea580c", "#65a30d", "#db2777", "#0d9488",
];

// --- Physics constants ---

export const REPULSION = 3000;
export const ATTRACTION = 0.005;
export const CENTER_GRAVITY = 0.01;
export const DAMPING = 0.9;
export const VELOCITY_THRESHOLD = 0.1;

// --- Node sizing constants ---

export const BASE_RADIUS = 6;
export const RADIUS_SCALE = 4;
export const MIN_RADIUS = 6;
export const MAX_RADIUS = 24;

export function nodeRadius(linkCount: number): number {
  const r = BASE_RADIUS + Math.sqrt(linkCount) * RADIUS_SCALE;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r));
}

// --- Physics simulation ---

export interface PhysicsResult {
  totalVelocity: number;
}

/**
 * Run one step of the force-directed physics simulation.
 * Mutates node positions (x, y) and velocities (vx, vy) in-place.
 */
export function stepPhysics(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  cx: number,
  cy: number,
): PhysicsResult {
  // Repulsion between all pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const distSq = dx * dx + dy * dy || 1;
      const force = REPULSION / distSq;
      const dist = Math.sqrt(distSq);
      dx /= dist;
      dy /= dist;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    }
  }

  // Attraction along edges
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const force = ATTRACTION * Math.sqrt(dx * dx + dy * dy);
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    a.vx += (dx / dist) * force;
    a.vy += (dy / dist) * force;
    b.vx -= (dx / dist) * force;
    b.vy -= (dy / dist) * force;
  }

  // Center gravity + damping + apply
  let totalVelocity = 0;
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_GRAVITY;
    n.vy += (cy - n.y) * CENTER_GRAVITY;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
    totalVelocity += Math.abs(n.vx) + Math.abs(n.vy);
  }

  return { totalVelocity };
}

// --- Canvas rendering ---

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

/**
 * Render the full graph scene: background, edges, nodes with cluster colors,
 * labels, hover tooltip, and cluster legend.
 */
export function renderGraph(opts: RenderOptions): void {
  const {
    nodes, edges, nodeMap, ctx,
    width: W, height: H,
    palette, hovered, mouse, clusterCount,
  } = opts;

  // Clear + fill background
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // Edges with thickness scaling
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const combinedLinks = (a.linkCount + b.linkCount) / 2;
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = Math.min(0.5 + combinedLinks * 0.15, 3);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Nodes with cluster colors + hover highlight
  const isDark = palette === DARK_PALETTE;
  const clusterFills = isDark ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_LIGHT;
  const clusterStrokes = isDark ? CLUSTER_STROKES_DARK : CLUSTER_STROKES_LIGHT;

  for (const n of nodes) {
    const r = nodeRadius(n.linkCount);
    const colorIdx = n.cluster % clusterFills.length;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = clusterFills[colorIdx];
    ctx.fill();
    ctx.strokeStyle = clusterStrokes[colorIdx];
    ctx.lineWidth = hovered?.id === n.id ? 2.5 : 1.5;
    ctx.stroke();

    // Label
    ctx.fillStyle = palette.label;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(n.label, n.x, n.y - r - 4);
  }

  // Tooltip for hovered node
  if (hovered) {
    const mx = mouse.x;
    const my = mouse.y;
    const connText = `${hovered.linkCount} connection${hovered.linkCount !== 1 ? "s" : ""}`;
    const tooltipText = `${hovered.label} — ${connText}`;
    ctx.font = "13px sans-serif";
    const metrics = ctx.measureText(tooltipText);
    const tipW = metrics.width + 16;
    const tipH = 28;
    let tipX = mx + 14;
    let tipY = my - tipH - 6;
    if (tipX + tipW > W) tipX = mx - tipW - 6;
    if (tipY < 0) tipY = my + 20;

    // Background
    ctx.fillStyle = palette.tooltipBg;
    roundedRect(ctx, tipX, tipY, tipW, tipH, 5);
    ctx.fill();

    // Border
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Text
    ctx.fillStyle = palette.tooltip;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(tooltipText, tipX + 8, tipY + 18);
  }

  // Cluster legend (bottom-left corner)
  if (clusterCount > 1) {
    const legendX = 12;
    const legendItemH = 18;
    const legendPad = 8;
    const displayCount = Math.min(clusterCount, clusterFills.length);
    const legendH = displayCount * legendItemH + legendPad * 2;
    const legendW = 110;
    const legendY = H - legendH - 12;

    // Count nodes per cluster
    const clusterSizes = new Map<number, number>();
    for (const n of nodes) {
      clusterSizes.set(n.cluster, (clusterSizes.get(n.cluster) ?? 0) + 1);
    }

    // Background
    ctx.fillStyle = palette.tooltipBg;
    roundedRect(ctx, legendX, legendY, legendW, legendH, 5);
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Items
    for (let i = 0; i < displayCount; i++) {
      const y = legendY + legendPad + i * legendItemH + 12;
      const colorIdx = i % clusterFills.length;
      const size = clusterSizes.get(i) ?? 0;

      // Color swatch
      ctx.beginPath();
      ctx.arc(legendX + 16, y - 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = clusterFills[colorIdx];
      ctx.fill();

      // Label
      ctx.fillStyle = palette.label;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Cluster ${i + 1} (${size})`, legendX + 26, y);
    }
  }
}

// --- Canvas drawing primitives ---

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Manual fallback for Safari <16
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
