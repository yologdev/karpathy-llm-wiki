"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RemoveFromVaultButtonProps {
  slug: string;
  /** The vault to remove the reference from (id = `<ownerTenant>--<nameSlug>`). */
  vaultId: string;
}

/**
 * Remove a curated commons reference from a specific vault — the inverse of the
 * vault picker, used to curate-out from the lens view (`/wiki?scope=vault:<id>`).
 * Removing drops the *reference* only; the underlying commons page is untouched.
 * The server re-checks ownership of the vault on the request.
 */
export function RemoveFromVaultButton({
  slug,
  vaultId,
}: RemoveFromVaultButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vaults/${vaultId}/pages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ gap: 8, alignItems: "baseline" }}>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="btn ghost"
        style={{ opacity: busy ? 0.5 : 1 }}
        title="Remove this reference from the vault"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && (
        <span
          className="receipt"
          style={{ fontSize: 11.5, color: "var(--rust)" }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
