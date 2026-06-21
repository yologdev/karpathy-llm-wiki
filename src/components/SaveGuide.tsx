"use client";

import { useEffect, useRef, useState } from "react";
import { buildBookmarklet } from "@/lib/share-target";

/**
 * The "how to use Save to yopedia" page (rendered at /save with no ?url). Walks a
 * visitor through the three no-extension capture surfaces — desktop bookmarklet,
 * PWA share target (Android), and iOS — as a numbered editorial field guide. The
 * bookmarklet is generated from the live origin so it always points at wherever
 * yopedia is served.
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
      // rather than silently resetting to a no-op state.
      setCopyState("fail");
    }
  }

  return (
    <div>
      <header className="rise sg-d1">
        <p className="fmark">Capture · no extension</p>
        <h1 className="display sg-title">Save to yopedia</h1>
        <p className="sg-lede">
          Send any page you’re reading to yopedia in one click — it fetches the
          link and ingests it into the commons. No extension to install; pick the
          method for your device.
        </p>
      </header>

      {/* 01 — Desktop bookmarklet (the hero method) */}
      <section className="sg-method sg-method--hero rise sg-d2">
        <div className="sg-num" aria-hidden="true">
          01
        </div>
        <div className="sg-body">
          <p className="fmark">Desktop · bookmarklet</p>
          <h2 className="sg-h">Drag the button to your bookmarks bar</h2>
          <p className="sg-p">
            Then click it on any page — a small window opens and saves what you’re
            reading.
          </p>

          <div className="sg-specimen">
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => e.preventDefault()}
              draggable
              title="Drag me to your bookmarks bar"
              className="sg-bm"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
              Save to yopedia
            </a>
            <span className="sg-draghint">↑ drag me to the bookmarks bar</span>
          </div>

          <details className="sg-details">
            <summary>Can’t drag it? Copy the code</summary>
            <p className="sg-p" style={{ marginTop: 8 }}>
              Create a new bookmark and paste this as its address:
            </p>
            <pre className="sg-code">{bookmarklet}</pre>
            <button type="button" onClick={copy} className="sg-copy">
              {copyState === "ok"
                ? "Copied ✓"
                : copyState === "fail"
                  ? "Copy failed — select the code above"
                  : "Copy code"}
            </button>
          </details>

          <p className="sg-note">
            Works in any desktop browser. A few sites (e.g. GitHub, X) block
            bookmarklets via their security policy — there it won’t run.
          </p>
        </div>
      </section>

      {/* 02 + 03 — Android & iOS, magazine two-up */}
      <div className="sg-pair rise sg-d3">
        <section className="sg-col">
          <div className="sg-num sg-num--sm" aria-hidden="true">
            02
          </div>
          <p className="fmark">Android · install &amp; share</p>
          <ol className="sg-steps">
            <li>
              Open yopedia in Chrome → menu (⋮) → <strong>Install app</strong> (or
              “Add to Home screen”).
            </li>
            <li>
              In any app, tap <strong>Share</strong> → choose{" "}
              <strong>yopedia</strong>. The link is saved.
            </li>
          </ol>
          <p className="sg-note">
            Uses the Web Share Target — yopedia registers as a share destination
            once installed.
          </p>
        </section>

        <section className="sg-col">
          <div className="sg-num sg-num--sm" aria-hidden="true">
            03
          </div>
          <p className="fmark">iPhone · iPad</p>
          <p className="sg-p">iOS Safari can’t share to a web app, so use one of:</p>
          <p className="sg-p">
            <strong>Bookmarklet</strong> — in Safari, bookmark any page, then edit
            it and paste the copied code as its address.
          </p>
          <p className="sg-p">
            <strong>Shortcut</strong> — Shortcuts app → new → enable{" "}
            <em>Use with Share Sheet</em> → an <em>Open URLs</em> action with{" "}
            <code className="sg-inline">/save?url=</code> + the input.
          </p>
        </section>
      </div>

      <p className="sg-footnote rise sg-d4">
        Saving needs a signed-in account — the first save prompts you to sign in,
        then continues.
      </p>
    </div>
  );
}
