"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GraphNode {
  id: string;
  label: string;
  linkCount: number;
  tags: string[];
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
            x: Math.random() * 400 + 100,
            y: Math.random() * 300 + 100,
            vx: 0,
            vy: 0,
          }));
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
    const W = canvas.width;
    const H = canvas.height;
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
    for (const n of nodes) {
      const r = nodeRadius(n.linkCount);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = palette.node;
      ctx.fill();
      ctx.strokeStyle = palette.nodeStroke;
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

  // Handle canvas resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = 560;
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [loading]);

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
        />
      </div>
      <p className="text-xs text-foreground/40 mt-2">
        Node size reflects connection count.
      </p>
    </main>
  );
}
