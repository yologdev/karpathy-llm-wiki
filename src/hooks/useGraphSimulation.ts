"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { detectCommunities } from "@/lib/graph";
import {
  type GraphNode,
  type GraphEdge,
  type GraphData,
  type ColorPalette,
  DARK_PALETTE,
  VELOCITY_THRESHOLD,
  nodeRadius,
  getColorPalette,
  stepPhysics,
  renderGraph,
} from "@/lib/graph-render";

export interface UseGraphSimulationReturn {
  loading: boolean;
  empty: boolean;
  fetchError: string | null;
  canvasBg: string;
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseLeave: () => void;
  handleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export function useGraphSimulation(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  router: AppRouterInstance,
): UseGraphSimulationReturn {
  const dataRef = useRef<GraphData | null>(null);
  const animRef = useRef<number>(0);
  const paletteRef = useRef<ColorPalette>(DARK_PALETTE);
  const hoveredRef = useRef<GraphNode | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const clusterCountRef = useRef<number>(0);
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());

  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [canvasBg, setCanvasBg] = useState<string>(DARK_PALETTE.bg);

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
    const nodeMap = nodeMapRef.current;

    // --- Physics step ---
    const { totalVelocity } = stepPhysics(nodes, edges, nodeMap, cx, cy);

    // --- Render ---
    renderGraph({
      nodes,
      edges,
      nodeMap,
      ctx,
      width: W,
      height: H,
      palette,
      hovered: hoveredRef.current,
      mouse: mouseRef.current,
      clusterCount: clusterCountRef.current,
    });

    // Continue or stop
    if (totalVelocity > VELOCITY_THRESHOLD) {
      animRef.current = requestAnimationFrame(simulate);
    }
  }, [canvasRef]);

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
          nodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
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
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);
        }
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
  }, [loading, simulate, canvasRef]);

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
    [simulate, canvasRef],
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
  }, [simulate, canvasRef]);

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
    [router, canvasRef],
  );

  return {
    loading,
    empty,
    fetchError,
    canvasBg,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
  };
}
