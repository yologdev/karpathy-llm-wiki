"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Vault } from "@/lib/vault";

interface VaultManagerProps {
  vaults: Vault[];
}

/** Folio text input — mirrors the AgentManager / Ask console input field. */
function FInput({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      style={{
        width: "100%",
        border: "1px solid var(--rule-strong)",
        borderRadius: 12,
        background: "var(--paper-2)",
        padding: "12px 16px",
        fontSize: 15,
        color: "var(--ink)",
        outline: "none",
        fontFamily: "var(--font-read)",
      }}
    />
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <span className="receipt" style={{ fontSize: 12, color: "var(--rust)" }}>
      {message}
    </span>
  );
}

/** A visibility chip — public = accent, private = rust. */
function VisibilityChip({ visibility }: { visibility: Vault["visibility"] }) {
  const isPublic = visibility === "public";
  return (
    <span
      className="receipt"
      style={{
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: ".06em",
        padding: "2px 8px",
        borderRadius: 999,
        background: isPublic ? "var(--accent-soft)" : "var(--rust-soft)",
        color: isPublic ? "var(--accent)" : "var(--rust)",
      }}
    >
      {visibility}
    </span>
  );
}

/** The "New vault" create form. */
function CreateVault() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div className="stack" style={{ gap: 12 }}>
        <FInput
          value={name}
          onChange={setName}
          placeholder="New vault name (e.g. Reading List)"
          onEnter={create}
        />
        <div
          className="row"
          style={{ gap: 12, flexWrap: "wrap", alignItems: "baseline" }}
        >
          <button
            type="button"
            className="btn primary"
            onClick={create}
            disabled={busy || !name.trim()}
          >
            {busy ? "Creating…" : "New vault"}
          </button>
          <span
            className="receipt"
            style={{ fontSize: 11.5, color: "var(--faint)" }}
          >
            new vaults are public
          </span>
          {error && <ErrorLine message={error} />}
        </div>
      </div>
    </div>
  );
}

/** A single vault management card. */
function VaultCard({ vault }: { vault: Vault }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(vault.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRename() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vaults/${vault.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete vault "${vault.name}"? The referenced commons pages are untouched.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vaults/${vault.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const count = vault.slugs.length;

  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div
        className="row"
        style={{ gap: 10, flexWrap: "wrap", alignItems: "baseline" }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: "-.02em",
            color: "var(--ink)",
          }}
        >
          {vault.name}
        </h3>
        <VisibilityChip visibility={vault.visibility} />
        <span
          className="receipt"
          style={{ fontSize: 11.5, color: "var(--faint)" }}
        >
          {count} {count === 1 ? "page" : "pages"}
        </span>
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 16 }}>
        <Link className="btn ghost" href={`/wiki?scope=vault:${vault.id}`}>
          View
        </Link>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setName(vault.name);
            setEditing((e) => !e);
          }}
        >
          {editing ? "Cancel" : "Rename"}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={remove}
          disabled={busy}
          style={{ color: "var(--rust)" }}
        >
          Delete
        </button>
        {error && <ErrorLine message={error} />}
      </div>

      {editing && (
        <div className="stack" style={{ gap: 12, marginTop: 16 }}>
          <FInput
            value={name}
            onChange={setName}
            placeholder="Vault name"
            onEnter={saveRename}
          />
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              onClick={saveRename}
              disabled={busy || !name.trim()}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The owner's vault management surface on `/vault`: a create form plus a card
 * per vault with view / rename / delete. All actions hit the `/api/vaults`
 * endpoints and refresh the server tree on success. (V1: created vaults are
 * public — no visibility selector yet.)
 */
export function VaultManager({ vaults }: VaultManagerProps) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <CreateVault />
      {vaults.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14.5 }}>
          No vaults yet. Create one above to start curating a reference lens over
          the commons.
        </p>
      ) : (
        vaults.map((v) => <VaultCard key={v.id} vault={v} />)
      )}
    </div>
  );
}
