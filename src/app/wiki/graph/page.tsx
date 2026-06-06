"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useGraphSimulation } from "@/hooks/useGraphSimulation";

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  // Public + your-vaults lens (consistent with /wiki and /query). Default scope
  // = undefined (the public commons). A `?scope=owner:<h>` / `agent:<id>`
  // deep-link pins the graph to that scope.
  const { isLoaded, isSignedIn } = useUser();
  const [scope, setScope] = useState<string | undefined>(undefined);

  // The signed-in user's vaults, for the lens selector (fetched on mount).
  const [myVaults, setMyVaults] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/vaults")
      .then((r) => (r.ok ? r.json() : { vaults: [] }))
      .then((d: { vaults?: { id: string; name: string }[] }) => {
        if (!cancelled) setMyVaults(d.vaults ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Initial scope once, on first Clerk load: a `?scope=` deep-link wins, else
  // default = undefined (the public commons). Reads location directly (not
  // useSearchParams) to avoid a client-side-rendering bailout of the page.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !isLoaded) return;
    didInit.current = true;
    const deepLink =
      new URLSearchParams(window.location.search).get("scope") || undefined;
    if (deepLink) setScope(deepLink);
  }, [isLoaded]);

  const scopedHandle = scope?.startsWith("owner:")
    ? scope.slice("owner:".length)
    : null;
  const activeVaultId = scope?.startsWith("vault:")
    ? scope.slice("vault:".length)
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
    <div
      className="row"
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        border: "1px solid var(--rule)",
        background: "var(--paper-2)",
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--muted)" }}>
        Graphing{" "}
        <Link
          href={`/u/${scopedHandle}`}
          style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "none" }}
        >
          @{scopedHandle}
        </Link>
        ’s pages
      </span>
      <button
        type="button"
        onClick={() => setScope(undefined)}
        style={{ color: "var(--muted)", background: "transparent", border: 0, cursor: "pointer" }}
        aria-label="Clear scope and show the full commons graph"
      >
        ✕
      </button>
    </div>
  ) : (
    <div
      role="group"
      aria-label="Graph scope"
      className="row"
      style={{ gap: 6, flexWrap: "wrap" }}
    >
      {[
        { scope: undefined as string | undefined, label: "Public", active: !activeVaultId },
        ...myVaults.map((v) => ({
          scope: `vault:${v.id}` as string | undefined,
          label: v.name,
          active: activeVaultId === v.id,
        })),
      ].map((o) => (
        <button
          key={o.scope ?? "all"}
          type="button"
          onClick={() => setScope(o.scope)}
          style={{
            fontSize: 13,
            padding: "5px 12px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            cursor: "pointer",
            border: `1px solid ${o.active ? "var(--ink)" : "var(--rule)"}`,
            background: o.active ? "var(--ink)" : "transparent",
            color: o.active ? "var(--paper)" : "var(--ink-2)",
          }}
        >
          {o.label}
        </button>
      ))}
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
            : activeVaultId
              ? "This vault has no pages yet."
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
