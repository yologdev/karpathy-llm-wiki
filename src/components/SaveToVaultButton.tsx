"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/components/folio/icons";

interface SaveToVaultButtonProps {
  slug: string;
}

interface VaultLite {
  id: string;
  name: string;
  visibility: "public" | "private";
}

/**
 * Save a commons page to one of your vaults — a personal reference lens over the
 * commons. "Saving" adds a *reference*, not a copy: the page stays a single
 * collective commons page; your vault just points at it (always live).
 *
 * A "Save to vault ▾" button opens a Folio popover that fetches the viewer's
 * vaults (`GET /api/vaults?slug=`) and shows a checkbox per vault (checked = the
 * page is already referenced). Toggling a checkbox POSTs/DELETEs the membership
 * (`/api/vaults/[id]/pages`); an inline "+ New vault" creates one and adds the
 * page. Rendered only to signed-in viewers on commons pages; the server
 * re-checks both on every request.
 */
export function SaveToVaultButton({ slug }: SaveToVaultButtonProps) {
  const [open, setOpen] = useState(false);
  const [vaults, setVaults] = useState<VaultLite[]>([]);
  const [containing, setContaining] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vaults?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data = (await res.json()) as {
        vaults?: VaultLite[];
        containing?: string[];
      };
      setVaults(data.vaults ?? []);
      setContaining(new Set(data.containing ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vaults");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Fetch vaults each time the popover opens (cheap; keeps state fresh).
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle(vaultId: string) {
    const inVault = containing.has(vaultId);
    setBusyId(vaultId);
    setError(null);
    try {
      const res = await fetch(`/api/vaults/${vaultId}/pages`, {
        method: inVault ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setContaining((prev) => {
        const next = new Set(prev);
        if (inVault) next.delete(vaultId);
        else next.add(vaultId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const { vault } = (await res.json()) as { vault: VaultLite };
      // Add the page to the freshly created vault, then reflect locally.
      const add = await fetch(`/api/vaults/${vault.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!add.ok) {
        const body = (await add.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${add.status})`);
      }
      setVaults((prev) =>
        prev.some((v) => v.id === vault.id) ? prev : [...prev, vault],
      );
      setContaining((prev) => new Set(prev).add(vault.id));
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  const savedCount = containing.size;

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {savedCount > 0 ? `In ${savedCount} vault${savedCount === 1 ? "" : "s"}` : "Save to vault"}
        <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 30,
            width: 280,
            background: "var(--paper-2)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            padding: 14,
          }}
        >
          <p className="fmark" style={{ marginBottom: 10 }}>
            save to vault
          </p>

          {loading ? (
            <p
              className="receipt"
              style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}
            >
              Loading…
            </p>
          ) : vaults.length === 0 ? (
            <p
              className="receipt"
              style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}
            >
              No vaults yet — create one below.
            </p>
          ) : (
            <ul
              className="stack"
              style={{ listStyle: "none", margin: 0, padding: 0, gap: 2 }}
            >
              {vaults.map((v) => {
                const checked = containing.has(v.id);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => toggle(v.id)}
                      disabled={busyId === v.id}
                      className="row"
                      style={{
                        width: "100%",
                        gap: 10,
                        alignItems: "center",
                        padding: "8px 8px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        opacity: busyId === v.id ? 0.5 : 1,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          flex: "0 0 auto",
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          border: `1px solid ${checked ? "var(--accent)" : "var(--rule-strong)"}`,
                          background: checked ? "var(--accent)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--paper)",
                        }}
                      >
                        {checked && <Icon.check width="12" height="12" />}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {v.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            className="stack"
            style={{
              gap: 8,
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createAndAdd();
                }
              }}
              placeholder="+ New vault"
              style={{
                width: "100%",
                border: "1px solid var(--rule-strong)",
                borderRadius: 10,
                background: "var(--paper)",
                padding: "9px 12px",
                fontSize: 13.5,
                color: "var(--ink)",
                outline: "none",
                fontFamily: "var(--font-read)",
              }}
            />
            {newName.trim() && (
              <button
                type="button"
                className="btn ghost"
                onClick={createAndAdd}
                disabled={creating}
                style={{ alignSelf: "flex-start" }}
              >
                {creating ? "Creating…" : "Create & save"}
              </button>
            )}
          </div>

          {error && (
            <p
              className="receipt"
              style={{ fontSize: 11.5, color: "var(--rust)", margin: "10px 0 0" }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
