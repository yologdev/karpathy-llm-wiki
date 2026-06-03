"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ShareWithYoyoButtonProps {
  slug: string;
  /** Whether this page is already shared into the viewer's yoyo. */
  initiallyShared: boolean;
}

/**
 * Toggles whether one of your own pages is shared into your yoyo's context.
 * "Share" is a grant (read-access reference), not a copy — the page stays
 * yours and unchanged; your yoyo just also sees it. Rendered only for the
 * page's owner or a contributor (the server gates this and re-checks the same
 * owner/contributor condition on the request).
 */
export function ShareWithYoyoButton({
  slug,
  initiallyShared,
}: ShareWithYoyoButtonProps) {
  const router = useRouter();
  const [shared, setShared] = useState(initiallyShared);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/share", {
        method: shared ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setShared(!shared);
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
          shared
            ? "Stop sharing this page with your yoyo"
            : "Share this page into your yoyo's context"
        }
      >
        {shared ? "✓ Shared with yoyo" : "Share with yoyo"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
