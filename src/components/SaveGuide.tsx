"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buildBookmarklet } from "@/lib/share-target";

/**
 * The "how to use Save to yopedia" page (rendered at /save with no ?url). Walks a
 * visitor through the three no-extension capture surfaces: a desktop bookmarklet,
 * the PWA share target (Android), and iOS. The bookmarklet is generated from the
 * live origin so it always points at wherever yopedia is served.
 */
export function SaveGuide() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [bookmarklet, setBookmarklet] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    const bm = buildBookmarklet(window.location.origin);
    setBookmarklet(bm);
    // React refuses to render a javascript: href, so set it on the live node —
    // dragging the link to the bookmarks bar copies this href verbatim.
    linkRef.current?.setAttribute("href", bm);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopyState("ok");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      // Clipboard can fail (denied permission, insecure context, older browser).
      // This IS the fallback affordance, so tell the user to grab the visible code
      // above rather than silently resetting to a no-op state.
      setCopyState("fail");
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 className="display" style={{ fontSize: 30, margin: "0 0 6px" }}>
        Save to yopedia
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14.5, margin: "0 0 28px", lineHeight: 1.55 }}>
        Send any page you’re reading to yopedia in one click — it fetches the link
        and ingests it into the commons. No browser extension required. Pick the
        method for your device.
      </p>

      {/* 1 — Desktop bookmarklet */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>① Desktop — bookmarklet</h2>
        <p style={pStyle}>
          Drag this button up to your bookmarks bar. Then, on any page, click it —
          a small window opens and saves the page.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "14px 0" }}>
          <a
            ref={linkRef}
            href="#"
            onClick={(e) => e.preventDefault()}
            draggable
            title="Drag me to your bookmarks bar"
            className="receipt"
            style={{
              display: "inline-block",
              fontSize: 13.5,
              fontWeight: 600,
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid var(--rule)",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              textDecoration: "none",
              cursor: "grab",
            }}
          >
            📑 Save to yopedia
          </a>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>← drag me to the bookmarks bar</span>
        </div>
        <details style={{ fontSize: 12.5, color: "var(--muted)" }}>
          <summary style={{ cursor: "pointer" }}>Can’t drag it? Copy the code instead</summary>
          <p style={{ margin: "8px 0" }}>
            Create a new bookmark and paste this as its URL/address:
          </p>
          <pre style={preStyle}>{bookmarklet}</pre>
          <button type="button" className="receipt" onClick={copy} style={btnSecondary}>
            {copyState === "ok"
              ? "Copied ✓"
              : copyState === "fail"
                ? "Copy failed — select the code above"
                : "Copy code"}
          </button>
        </details>
        <p style={{ ...noteStyle }}>
          Works in any desktop browser. A few sites (e.g. GitHub, X) block
          bookmarklets via their security policy — there it won’t run.
        </p>
      </section>

      {/* 2 — Android / PWA share target */}
      <section style={sectionStyle}>
        <h2 style={h2Style}>② Android — install &amp; share</h2>
        <ol style={olStyle}>
          <li>
            Open yopedia in Chrome → menu (⋮) → <strong>Install app</strong> (or
            “Add to Home screen”).
          </li>
          <li>
            Now in any app, tap <strong>Share</strong> → choose{" "}
            <strong>yopedia</strong> from the share sheet. The link is saved.
          </li>
        </ol>
        <p style={noteStyle}>
          Uses the Web Share Target — yopedia registers as a share destination
          once installed.
        </p>
      </section>

      {/* 3 — iOS */}
      <section style={{ ...sectionStyle, borderBottom: "none" }}>
        <h2 style={h2Style}>③ iPhone / iPad</h2>
        <p style={pStyle}>
          iOS Safari doesn’t support share-to-web-app, so use one of these:
        </p>
        <p style={{ ...pStyle, marginTop: 10 }}>
          <strong>Bookmarklet (simplest):</strong> in Safari, bookmark any page,
          then edit that bookmark and replace its address with the copied code
          above. Tap it from your bookmarks on any page to save.
        </p>
        <p style={{ ...pStyle, marginTop: 10 }}>
          <strong>Share-sheet Shortcut:</strong> open the Shortcuts app → new
          shortcut → enable <em>Use with Share Sheet</em> (accept URLs) → add an{" "}
          <em>Open URLs</em> action with{" "}
          <code style={codeStyle}>/save?url=</code> + the Shortcut input. Then{" "}
          Share → your shortcut.
        </p>
      </section>

      <p style={{ marginTop: 28, fontSize: 13, color: "var(--muted)" }}>
        Saving requires a signed-in yopedia account — the first save will prompt
        you to sign in, then continue.
      </p>
    </div>
  );
}

const sectionStyle: CSSProperties = {
  padding: "20px 0",
  borderBottom: "1px solid var(--rule)",
};
const h2Style: CSSProperties = { fontSize: 16, margin: "0 0 8px" };
const pStyle: CSSProperties = { fontSize: 13.5, color: "var(--ink)", margin: 0, lineHeight: 1.6 };
const noteStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--faint)",
  margin: "12px 0 0",
  lineHeight: 1.5,
};
const olStyle: CSSProperties = {
  fontSize: 13.5,
  color: "var(--ink)",
  lineHeight: 1.7,
  margin: 0,
  paddingLeft: 20,
};
const preStyle: CSSProperties = {
  fontSize: 11,
  background: "var(--surface, #18181b0a)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  padding: 10,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};
const codeStyle: CSSProperties = {
  fontSize: 12,
  background: "var(--surface, #18181b0a)",
  padding: "1px 5px",
  borderRadius: 4,
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
