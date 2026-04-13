"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { detectCommunities } from "@/lib/graph";

interface GraphNode {
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

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ColorPalette {
  bg: string;
  edge: string;
  node: string;
  nodeStroke: string;
  label: string;
  tooltip: string;
  tooltipBg: string;
}

const DARK_PALETTE: ColorPalette = {
  bg: "#0a0a0a",
  edge: "#4a5568",
  node: "#60a5fa",
  nodeStroke: "#93c5fd",
  label: "#e2e8f0",
  tooltip: "#f1f5f9",
  tooltipBg: "rgba(30, 41, 59, 0.92)",
};

const LIGHT_PALETTE: ColorPalette = {
  bg: "#ffffff",
  edge: "#cbd5e1",
  node: "#3b82f6",
  nodeStroke: "#2563eb",
  label: "#1e293b",
  tooltip: "#1e293b",
  tooltipBg: "rgba(248, 250, 252, 0.92)",
};

function getColorPalette(): ColorPalette {
  if (typeof window === "undefined") return DARK_PALETTE;
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return isDark ? DARK_PALETTE : LIGHT_PALETTE;
}

// Cluster colors: distinct hues for community detection coloring
const CLUSTER_COLORS_DARK = [
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

const CLUSTER_COLORS_LIGHT = [
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
const CLUSTER_STROKES_DARK = [
  "#93c5fd", "#6ee7b7", "#fcd34d", "#fca5a5", "#c4b5fd",
  "#67e8f9", "#fdba74", "#bef264", "#f9a8d4", "#5eead4",
];

const CLUSTER_STROKES_LIGHT = [
  "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed",
  "#0891b2", "#ea580c", "#65a30d", "#db2777", "#0d9488",
];

const REPULSION = 3000;
const ATTRACTION = 0.005;
const CENTER_GRAVITY = 0.01;
const DAMPING = 0.9;
const VELOCITY_THRESHOLD = 0.1;

// Node sizing constants
const BASE_RADIUS = 6;
const RADIUS_SCALE = 4;
const MIN_RADIUS = 6;
const MAX_RADIUS = 24;

function nodeRadius(linkCount: number): number {
  const r = BASE_RADIUS + Math.sqrt(linkCount) * RADIUS_SCALE;
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r));
}

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<GraphData | null>(null);
  const animRef = useRef<number>(0);
  const paletteRef = useRef<ColorPalette>(DARK_PALETTE);
  const hoveredRef = useRef<GraphNode | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [canvasBg, setCanvasBg] = useState<string>(DARK_PALETTE.bg);
  const clusterCountRef = useRef<number>(0);

  // Fetch graph data
  useEffect(() => {
    fetch("/api/wiki/graph")
      .then((r) => {
        if (!r.ok) throw new Error(`Graph API error: ${r.status}`);
        return r.json();
      })
      .then(
        (raw: {
          nodes: {
            id: string;
            label: string;
            linkCount?: number;
            tags?: string[];
          }[];
          edges: GraphEdge[];
        }) => {
          if (!raw.nodes || raw.nodes.length === 0) {
            setEmpty(true);
            setLoading(false);
            return;
          }
          // Initialize positions randomly
          const nodes: GraphNode[] = raw.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            linkCount: n.linkCount ?? 0,
            tags: n.tags ?? [],
            cluster: 0,
            x: Math.random() * 400 + 100,
            y: Math.random() * 300 + 100,
            vx: 0,
            vy: 0,
          }));

          // Community detection
          const nodeIds = raw.nodes.map((n) => n.id);
          const edgePairs: [string, string][] = (raw.edges ?? []).map(
            (e: GraphEdge) => [e.source, e.target] as [string, string],
          );
          const { clusters, count } = detectCommunities({
            nodes: nodeIds,
            edges: edgePairs,
          });
          for (const node of nodes) {
            node.cluster = clusters.get(node.id) ?? 0;
          }
          clusterCountRef.current = count;

          dataRef.current = { nodes, edges: raw.edges ?? [] };
          setLoading(false);
        },
      )
      .catch((err) => {
        setFetchError(String(err));
        setLoading(false);
      });
  }, []);

  // Detect color scheme and listen for changes
  useEffect(() => {
    const palette = getColorPalette();
    paletteRef.current = palette;
    setCanvasBg(palette.bg);

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const newPalette = getColorPalette();
      paletteRef.current = newPalette;
      setCanvasBg(newPalette.bg);
      // Re-trigger a render frame if simulation has stopped
      if (dataRef.current && canvasRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(simulate);
      }
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulation + render loop
  const simulate = useCallback(() => {
    const data = dataRef.current;
    const canvas = canvasRef.current;
    if (!data || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = paletteRef.current;
    // Use CSS dimensions (not canvas.width/height which are DPR-scaled)
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const cx = W / 2;
    const cy = H / 2;
    const { nodes, edges } = data;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // --- Physics step ---
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
    let totalV = 0;
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER_GRAVITY;
      n.vy += (cy - n.y) * CENTER_GRAVITY;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
      totalV += Math.abs(n.vx) + Math.abs(n.vy);
    }

    // --- Render ---
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);

    // Edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      // Subtle thickness scaling based on combined connection count
      const combinedLinks = (a.linkCount + b.linkCount) / 2;
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = Math.min(0.5 + combinedLinks * 0.15, 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Nodes
    const hovered = hoveredRef.current;
    const isDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const clusterFills = isDark ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_LIGHT;
    const clusterStrokes = isDark
      ? CLUSTER_STROKES_DARK
      : CLUSTER_STROKES_LIGHT;

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
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const connText = `${hovered.linkCount} connection${hovered.linkCount !== 1 ? "s" : ""}`;
      const tooltipText = `${hovered.label} — ${connText}`;
      ctx.font = "13px sans-serif";
      const metrics = ctx.measureText(tooltipText);
      const tipW = metrics.width + 16;
      const tipH = 28;
      // Position tooltip near cursor, keeping it within canvas bounds
      let tipX = mx + 14;
      let tipY = my - tipH - 6;
      if (tipX + tipW > W) tipX = mx - tipW - 6;
      if (tipY < 0) tipY = my + 20;

      // Background
      ctx.fillStyle = palette.tooltipBg;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 5);
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
    const clusterCount = clusterCountRef.current;
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
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendW, legendH, 5);
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
        ctx.fillText(
          `Cluster ${i + 1} (${size})`,
          legendX + 26,
          y,
        );
      }
    }

    // Continue or stop
    if (totalV > VELOCITY_THRESHOLD) {
      animRef.current = requestAnimationFrame(simulate);
    }
  }, []);

  // Start simulation when data is ready
  useEffect(() => {
    if (!loading && !empty && dataRef.current) {
      animRef.current = requestAnimationFrame(simulate);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [loading, empty, simulate]);

  // Handle canvas resizing (HiDPI-aware)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const dpr = window.devicePixelRatio || 1;
        const w = parent.clientWidth;
        const h = 560;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
        // Trigger a re-render after resize so content redraws at new resolution
        if (dataRef.current) {
          cancelAnimationFrame(animRef.current);
          animRef.current = requestAnimationFrame(simulate);
        }
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [loading, simulate]);

  // Mousemove handler — hover detection, cursor change, tooltip trigger
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const data = dataRef.current;
      const canvas = canvasRef.current;
      if (!data || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      mouseRef.current = { x: mx, y: my };

      let found: GraphNode | null = null;
      for (const n of data.nodes) {
        const r = nodeRadius(n.linkCount);
        const dx = n.x - mx;
        const dy = n.y - my;
        if (dx * dx + dy * dy <= (r + 4) ** 2) {
          found = n;
          break;
        }
      }

      const prev = hoveredRef.current;
      hoveredRef.current = found;
      canvas.style.cursor = found ? "pointer" : "default";

      // If hover state changed, trigger a re-render even if simulation settled
      if (prev?.id !== found?.id) {
        cancelAnimationFrame(animRef.current);
        animRef.current = requestAnimationFrame(simulate);
      }
    },
    [simulate],
  );

  // Mouseleave — clear hover
  const handleMouseLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (hoveredRef.current) {
      hoveredRef.current = null;
      if (canvas) canvas.style.cursor = "default";
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(simulate);
    }
  }, [simulate]);

  // Click handler — navigate to clicked node
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const data = dataRef.current;
      const canvas = canvasRef.current;
      if (!data || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const n of data.nodes) {
        const r = nodeRadius(n.linkCount);
        const dx = n.x - mx;
        const dy = n.y - my;
        if (dx * dx + dy * dy <= (r + 4) ** 2) {
          router.push(`/wiki/${n.id}`);
          return;
        }
      }
    },
    [router],
  );

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-6">Wiki Graph</h1>
        <p className="text-foreground/60">Loading graph…</p>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-6">Wiki Graph</h1>
        <p className="text-red-500">
          Failed to load graph data: {fetchError}
        </p>
      </main>
    );
  }

  if (empty) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-6">Wiki Graph</h1>
        <p className="text-foreground/60">
          No wiki pages yet. Ingest some content to see the graph!
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Wiki Graph</h1>
      <p className="text-sm text-foreground/60 mb-4">
        Click a node to open the page.
      </p>
      <div className="w-full overflow-hidden rounded-lg border border-foreground/10">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="block w-full"
          style={{ height: 560, backgroundColor: canvasBg }}
          role="img"
          aria-label="Wiki page relationship graph. Visit the wiki index for a text-based list of all pages."
          tabIndex={0}
        >
          Wiki relationship graph — see wiki index for accessible page listing.
        </canvas>
      </div>
      <p className="text-xs text-foreground/40 mt-2">
        Node size reflects connection count. Colors indicate detected
        communities.
      </p>
    </main>
  );
}
