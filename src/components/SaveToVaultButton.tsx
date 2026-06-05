"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SaveToVaultButtonProps {
  slug: string;
  /** Whether this page is already curated into the viewer's vault. */
  initiallyInVault: boolean;
}

/**
 * Curate / uncurate a commons page into your vault — a personal reference lens
 * over the commons. "Curate" adds a *reference*, not a copy: the page stays a
 * single collective commons page; your vault just points at it (always live).
 * Rendered only to signed-in viewers on commons (public, non-agent) pages; the
 * server re-checks both on the request.
 */
export function SaveToVaultButton({
  slug,
  initiallyInVault,
}: SaveToVaultButtonProps) {
  const router = useRouter();
  const [inVault, setInVault] = useState(initiallyInVault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vault", {
        method: inVault ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setInVault(!inVault);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
        title={
          inVault
            ? "Remove this page from your vault"
            : "Save this page to your vault (a live reference, not a copy)"
        }
      >
        {inVault ? "✓ In your vault" : "Save to vault"}
      </button>
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </span>
  );
}
