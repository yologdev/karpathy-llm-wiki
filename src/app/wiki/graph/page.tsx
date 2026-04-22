"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useGraphSimulation } from "@/hooks/useGraphSimulation";

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  const {
    loading,
    empty,
    fetchError,
    canvasBg,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
  } = useGraphSimulation(canvasRef, router);

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
