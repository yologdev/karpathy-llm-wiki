"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { IngestVaultPicker } from "./IngestVaultPicker";
import { hostOf } from "@/lib/share-target";
import { rememberRecentJob } from "@/lib/recent-ingests";

type Status = "loading" | "signin" | "confirm" | "saving" | "saved" | "error";

/** Strip the "(3)"/"(99+)" unread-count prefix browsers prepend to a page
 *  <title>, and trim surrounding whitespace. */
function cleanTitle(t?: string): string {
  return (t ?? "").replace(/^\(\d+\+?\)\s*/, "").trim();
}

/**
 * The capture target for all three surfaces (bookmarklet popup, PWA share, iOS
 * Shortcut). It runs on yopedia's own origin, so the user's session cookie
 * authenticates the save. When signed in it shows a CONFIRM step — the captured
 * URL, an editable title (the raw page <title> is often noisy), and a vault
 * picker — and nothing is ingested until the user clicks Save. Signed-out → a
 * sign-in prompt, then the confirm step once the session lands.
 */
export function SaveCapture({ url, title }: { url: string; title?: string }) {
  const { isSignedIn, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  const [status, setStatus] = useState<Status>("loading");
  const [editTitle, setEditTitle] = useState(cleanTitle(title));
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (status === "saving") return; // guard against double-submit / Enter-mash
    setStatus("saving");
    setError(null);
    try {
      const trimmed = editTitle.trim();
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          ...(trimmed ? { title: trimmed } : {}),
          ...(vaultId ? { vaultId } : {}),
        }),
      });
      if (res.status === 401) {
        // Session expired between landing here and clicking Save. editTitle +
        // vaultId are component state, so they survive the re-auth — but tell the
        // user WHY they're back at sign-in so the dropped save isn't silent.
        setError("Your session expired — sign in to finish saving.");
        setStatus("signin");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        setStatus("error");
        return;
      }
      // Record the queued job so the /ingest "Recent ingests" strip shows this
      // save IN FLIGHT. localStorage is shared across same-origin tabs and that
      // page refreshes on focus, so a popup/bookmarklet save surfaces as a live
      // "working…" row instead of only appearing once it lands in the ledger.
      if (data.jobId) rememberRecentJob(data.jobId);
      // The URL path always returns a jobId; a 200 without one means a malformed
      // (e.g. edge-proxied) response — the save shows "saved" but won't appear in
      // Recent ingests, so leave a breadcrumb rather than failing silently.
      else console.warn("[SaveCapture] ingest returned 200 without a jobId — not tracked in Recent ingests");
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStatus("error");
    }
  }

  // Dismiss the capture view. A bookmarklet popup is script-opened so
  // window.close() works; the PWA-share / iOS-Shortcut surfaces open a normal
  // tab where close() is a no-op — fall back to navigating so the button isn't
  // dead.
  function dismiss(fallback: string) {
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.href = fallback;
    }, 120);
  }

  // Move to the confirm step once signed in (or the sign-in prompt if not) —
  // but never clobber an in-progress / finished save.
  useEffect(() => {
    if (!isLoaded) return;
    setStatus((s) => {
      if (s === "saving" || s === "saved" || s === "error") return s;
      return isSignedIn ? "confirm" : "signin";
    });
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
        {url}
      </p>

      {status === "loading" && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Checking your session…</p>
      )}

      {status === "signin" && (
        <div>
          {error && (
            <p style={{ fontSize: 13, color: "var(--danger, #dc2626)", marginBottom: 10 }}>
              {error}
            </p>
          )}
          <p style={{ fontSize: 13.5, marginBottom: 12 }}>
            Sign in to save this page to yopedia.
          </p>
          <button
            type="button"
            className="receipt"
            // Modal sign-in keeps us on this page; once the session lands,
            // isSignedIn flips and the effect advances to the confirm step.
            onClick={() => openSignIn()}
            style={btnPrimary}
          >
            Sign in
          </button>
        </div>
      )}

      {status === "confirm" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label
            className="receipt"
            style={labelStyle}
          >
            Title
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
            placeholder={host}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: "var(--paper)",
              color: "var(--ink)",
              marginBottom: 14,
              boxSizing: "border-box",
            }}
          />

          <label
            className="receipt"
            style={labelStyle}
          >
            Vault (optional)
          </label>
          <div style={{ marginBottom: 22 }}>
            <IngestVaultPicker value={vaultId} onChange={setVaultId} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="receipt" style={btnPrimary}>
              Save
            </button>
            <button type="button" className="receipt" onClick={() => dismiss("/")} style={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {status === "saving" && (
        <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Saving {host}…</p>
      )}

      {status === "error" && (
        <div>
          <p style={{ fontSize: 13.5, color: "var(--danger, #dc2626)", marginBottom: 12 }}>
            {error}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="receipt" onClick={() => save()} style={btnPrimary}>
              Retry
            </button>
            <button type="button" className="receipt" onClick={() => setStatus("confirm")} style={btnSecondary}>
              Edit
            </button>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            <span style={{ color: "var(--accent)" }}>✓ Saved.</span> yopedia is reading{" "}
            <strong>{host}</strong> now — it’ll appear in the commons shortly.
          </p>

          <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
            {/* Post-save, the only action is to dismiss. (No in-popup "View
                activity" nav — re-mounting drops back to the confirm step, which
                is confusing right after a save; dismissing is the right action.) */}
            <button type="button" className="receipt" onClick={() => dismiss("/ingest")} style={btnPrimary}>
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

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  color: "var(--muted)",
  marginBottom: 6,
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
