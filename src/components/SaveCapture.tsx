"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { IngestVaultPicker } from "./IngestVaultPicker";
import { hostOf } from "@/lib/share-target";

type Status = "loading" | "signin" | "saving" | "saved" | "error";

/**
 * The capture target for all three surfaces (bookmarklet popup, PWA share, iOS
 * Shortcut). It runs on yopedia's own origin, so the user's session cookie
 * authenticates the save automatically. When signed in it fires `POST /api/ingest`
 * immediately (the click/share WAS the intent), shows status, and offers to also
 * file the page into a vault. Signed-out → a sign-in prompt; the save fires once
 * the session lands.
 */
export function SaveCapture({ url, title }: { url: string; title?: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  const [status, setStatus] = useState<Status>("loading");
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  async function save(vault: string | null) {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          ...(title ? { title } : {}),
          ...(vault ? { vaultId: vault } : {}),
        }),
      });
      if (res.status === 401) {
        setStatus("signin");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Save failed (${res.status})`);
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStatus("error");
    }
  }

  // Auto-fire once when signed in. The bookmarklet/share click is itself the
  // intent to save, so we don't make the user click again. Re-ingesting the same
  // URL is deduped server-side, so a refresh is harmless.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("signin");
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    void save(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const host = hostOf(url);

  return (
    <div className="shell" style={{ maxWidth: 460, margin: "0 auto", padding: "8px 0" }}>
      <h1 className="display" style={{ fontSize: 22, margin: "0 0 4px" }}>
        Save to yopedia
      </h1>
      <p
        className="receipt"
        style={{
          fontSize: 12.5,
          color: "var(--muted)",
          margin: "0 0 18px",
          wordBreak: "break-all",
        }}
        title={url}
      >
        {title ? <strong style={{ color: "var(--ink)" }}>{title}</strong> : null}
        {title ? <br /> : null}
        {url}
      </p>

      {status === "loading" && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Checking your session…</p>
      )}

      {status === "signin" && (
        <div>
          <p style={{ fontSize: 13.5, marginBottom: 12 }}>
            Sign in to save this page to yopedia.
          </p>
          <button
            type="button"
            className="receipt"
            // Modal sign-in keeps us on this page; once the session lands,
            // isSignedIn flips and the auto-save effect fires. No redirect needed.
            onClick={() => openSignIn()}
            style={btnPrimary}
          >
            Sign in & save
          </button>
        </div>
      )}

      {status === "saving" && (
        <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Saving {host}…</p>
      )}

      {status === "error" && (
        <div>
          <p style={{ fontSize: 13.5, color: "var(--danger, #dc2626)", marginBottom: 12 }}>
            {error}
          </p>
          <button type="button" className="receipt" onClick={() => save(vaultId)} style={btnPrimary}>
            Retry
          </button>
        </div>
      )}

      {status === "saved" && (
        <div>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            <span style={{ color: "var(--accent)" }}>✓ Saved.</span> yopedia is reading{" "}
            <strong>{host}</strong> now — it’ll appear in the commons shortly.
          </p>

          <label
            className="receipt"
            style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}
          >
            Also file it in a vault (optional)
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <IngestVaultPicker value={vaultId} onChange={setVaultId} />
            {vaultId && (
              <button type="button" className="receipt" onClick={() => save(vaultId)} style={btnSecondary}>
                Add to vault
              </button>
            )}
          </div>

          <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
            {/* A popup's only post-save action is to close it. (No in-popup
                "View activity" nav — it re-mounts this page and re-fires the
                save; the server dedups it, but closing is the right action.) */}
            <button type="button" className="receipt" onClick={() => window.close()} style={btnPrimary}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: CSSProperties = {
  fontSize: 13,
  padding: "7px 16px",
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "var(--accent-soft)",
  color: "var(--accent)",
  cursor: "pointer",
};

const btnSecondary: CSSProperties = {
  fontSize: 12.5,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "transparent",
  color: "var(--muted)",
  cursor: "pointer",
};
