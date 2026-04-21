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
