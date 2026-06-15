"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

interface VaultOption {
  id: string;
  name: string;
}

interface IngestVaultPickerProps {
  value: string | null;
  onChange: (vaultId: string | null) => void;
}

/**
 * Self-contained vault picker for the ingest form. Fetches the signed-in
 * user's vaults on mount and renders a dropdown with a "None" default.
 * Returns `null` (renders nothing) when the user is not signed in or has
 * no vaults.
 */
export function IngestVaultPicker({ value, onChange }: IngestVaultPickerProps) {
  const { isSignedIn } = useUser();
  const [vaults, setVaults] = useState<VaultOption[]>([]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/vaults")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.vaults) return;
        setVaults(
          (data.vaults as VaultOption[]).map((v) => ({ id: v.id, name: v.name })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  if (!isSignedIn || vaults.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <label
        htmlFor="vault-picker"
        className="block text-sm font-medium"
        style={{ marginBottom: 6 }}
      >
        Destination vault{" "}
        <span className="text-foreground/40">(optional)</span>
      </label>
      <select
        id="vault-picker"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:border-foreground/50 focus:outline-none transition-colors"
      >
        <option value="">None (commons only)</option>
        {vaults.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}
