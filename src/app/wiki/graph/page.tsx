"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useGraphSimulation } from "@/hooks/useGraphSimulation";

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  // Mine|All lens (consistent with /wiki and /query). A `?scope=owner:<h>`
  // deep-link (from a /u/<handle> silo) pins the graph to that silo.
  const { isLoaded, isSignedIn } = useUser();
  const [scope, setScope] = useState<string | undefined>(undefined);

  // Initial scope once, on first Clerk load: a `?scope=` deep-link wins, else
  // signed-in users default to "mine". Reads location directly (not
  // useSearchParams) to avoid a client-side-rendering bailout of the page.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !isLoaded) return;
    didInit.current = true;
    const deepLink =
      new URLSearchParams(window.location.search).get("scope") || undefined;
    if (deepLink) setScope(deepLink);
    else if (isSignedIn) setScope("mine");
  }, [isLoaded, isSignedIn]);

  const scopedHandle = scope?.startsWith("owner:")
    ? scope.slice("owner:".length)
    : null;

  const {
    loading,
    empty,
    fetchError,
    canvasBg,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
  } = useGraphSimulation(canvasRef, router, scope);

  const lens = scopedHandle ? (
    <div className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-1.5 text-sm">
      <span className="text-foreground/70">
        Graphing{" "}
        <Link
          href={`/u/${scopedHandle}`}
          className="font-medium text-foreground hover:underline"
        >
          @{scopedHandle}
        </Link>
        ’s pages
      </span>
      <button
        type="button"
        onClick={() => setScope(undefined)}
        className="text-foreground/50 hover:text-foreground"
        aria-label="Clear scope and show the full commons graph"
      >
        ✕
      </button>
    </div>
  ) : (
    <div
      role="group"
      aria-label="Graph scope"
      className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 p-1"
    >
      {isSignedIn && (
        <button
          type="button"
          onClick={() => setScope("mine")}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            scope === "mine"
              ? "bg-foreground/10 font-semibold text-foreground"
              : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          Mine
        </button>
      )}
      <button
        type="button"
        onClick={() => setScope(undefined)}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          scope === undefined
            ? "bg-foreground/10 font-semibold text-foreground"
            : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
        }`}
      >
        All
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Wiki Graph</h1>
        {lens}
      </div>

      {loading ? (
        <p className="text-foreground/60">Loading graph…</p>
      ) : fetchError ? (
        <p className="text-red-500">Failed to load graph data: {fetchError}</p>
      ) : empty ? (
        <p className="text-foreground/60">
          {scopedHandle
            ? `No pages in @${scopedHandle}’s silo yet.`
            : scope === "mine"
              ? "You haven’t added any pages yet."
              : "No wiki pages yet. Ingest some content to see the graph!"}
        </p>
      ) : (
        <>
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
        </>
      )}
    </main>
  );
}
