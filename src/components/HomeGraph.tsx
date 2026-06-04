"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGraphSimulation } from "@/hooks/useGraphSimulation";

/**
 * Ambient knowledge-graph visual for the homepage — "a second brain you can
 * see." Reuses the full graph simulation (the content is small enough that the
 * whole graph is the preview); clicking a node opens its page. Silently absent
 * when there's nothing to show, so it never breaks the page.
 */
export function HomeGraph({ height = 340 }: { height?: number }) {
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

  if (fetchError || empty) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block w-full"
        style={{ height, backgroundColor: canvasBg }}
        role="img"
        aria-label="Knowledge graph of interlinked wiki pages. Visit the wiki index for a text list."
        tabIndex={0}
      >
        Knowledge graph — see the wiki index for an accessible page listing.
      </canvas>
      <Link
        href="/wiki/graph"
        className="receipt absolute right-2 top-2 rounded border border-border bg-background/70 px-2 py-1 text-[11px] text-muted backdrop-blur hover:text-foreground transition-colors"
      >
        open graph →
      </Link>
      {loading && (
        <div className="receipt pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
          mapping the substrate…
        </div>
      )}
    </div>
  );
}
