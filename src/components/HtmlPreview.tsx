"use client";

import { useEffect, useRef, useState } from "react";
import {
  composeSrcDoc,
  usesChartLib,
  usesViewportUnits,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
  HTML_HEIGHT_MESSAGE_KEY,
} from "@/lib/html";
import { htmlHasMermaid, renderMermaidInHtml } from "@/lib/mermaid";
import { logger } from "@/lib/logger";

/**
 * Render model-authored HTML SAFELY in a sandboxed iframe.
 *
 * Security = isolation, not sanitization: `sandbox="allow-scripts"` WITHOUT
 * `allow-same-origin` gives the frame a unique opaque origin, so scripts run but
 * cannot read the app's cookies/DOM/storage/session or make credentialed
 * requests; an injected CSP (see {@link composeSrcDoc}) additionally blocks all
 * network egress and external resources. Rendered via `srcDoc` — NEVER
 * `dangerouslySetInnerHTML`. Frame height is reported by the document via
 * postMessage (clamped to a max to bound a runaway/hostile grow).
 */
export function HtmlPreview({
  html,
  bare = false,
}: {
  html: string;
  /** Full-bleed share view: no border/radius, fills the viewport below the
   *  share header. The auto-height still drives growth; this only restyles. */
  bare?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);
  // App-style artifacts (full-viewport 100vh layouts) get a fixed, scroll-hidden
  // frame instead of auto-height; see the iframe below.
  const appStyle = usesViewportUnits(html);

  // Match the artifact's paper/ink to the page's RESOLVED theme (yopedia toggles
  // a `dark`/`light` class on <html> via localStorage; the sandboxed iframe can't
  // read that, so we read it here and bake it into the srcDoc). Re-render when the
  // user flips the toggle so the artifact follows.
  // Start "light" (SSR-stable, avoids a srcDoc hydration mismatch); the effect
  // below corrects to the real theme immediately on mount (one frame after first
  // paint — useEffect, not useLayoutEffect, which would warn under SSR).
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () =>
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Lazy-load the (~200KB) Chart.js source ONLY for documents that actually use
  // it, so prose/table answers don't pay for it. The chartless render happens
  // immediately; a chart document re-renders once the library resolves.
  const [chartLib, setChartLib] = useState<string | undefined>(undefined);
  const needsChart = usesChartLib(html);
  useEffect(() => {
    let cancelled = false;
    if (needsChart && chartLib === undefined) {
      import("@/lib/vendor/chartjs.generated")
        .then((m) => {
          if (!cancelled) setChartLib(m.CHARTJS_SOURCE);
        })
        .catch((err) => {
          // Graceful degradation: the document still renders (just without the
          // chart). Log so intermittent post-deploy chunk-load failures are
          // debuggable rather than an invisible "chart sometimes missing".
          if (!cancelled)
            logger.warn(
              "html",
              "chart library failed to load; rendering without chart",
              err,
            );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [needsChart, chartLib]);

  // Transform the model HTML in the parent app before it reaches the iframe:
  // Mermaid `<pre class="mermaid">` → inline SVG, keeping the iframe
  // self-contained (static SVG — no library injection, no network). yoyo
  // illustrations are already baked into self-contained `data:` <img> refs
  // server-side (at /query), so there's nothing to fill in here. Starts from the
  // raw html and swaps in the transformed version.
  const [renderedHtml, setRenderedHtml] = useState(html);
  useEffect(() => {
    let cancelled = false;
    setRenderedHtml(html);
    (async () => {
      let out = html;
      if (htmlHasMermaid(out)) {
        try {
          out = await renderMermaidInHtml(out);
        } catch (err) {
          logger.warn("html", "mermaid render failed; showing source", err);
        }
      }
      if (!cancelled && out !== html) setRenderedHtml(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Trust only messages from THIS frame's window, with the expected shape.
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const reported = (e.data as Record<string, unknown> | null)?.[
        HTML_HEIGHT_MESSAGE_KEY
      ];
      if (typeof reported === "number" && reported > 0) {
        // Clamp: cap a runaway/hostile grow, and floor a degenerate (e.g. 1px)
        // report so the artifact can't collapse to an invisible sliver.
        setHeight(Math.max(140, Math.min(Math.ceil(reported), HTML_MAX_HEIGHT)));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      // Document-style artifacts auto-size to content (the page scrolls, no
      // inner scrollbar). "App-style" artifacts that lay out against the
      // viewport (100vh) define their own scroll viewport — auto-sizing
      // feedback-loops them to absurd heights — so we fix the frame and let
      // them scroll INSIDE it, with that inner scrollbar hidden. Full-screen
      // share (`bare`) fills the viewport; inline gets a tall contained frame.
      srcDoc={composeSrcDoc(renderedHtml, chartLib, bare || appStyle, theme)}
      sandbox={HTML_SANDBOX}
      title="HTML output"
      style={{
        width: "100%",
        height: bare
          ? "calc(100dvh - 56px)"
          : appStyle
            ? "80vh"
            : height,
        border: bare ? "none" : "1px solid var(--rule)",
        borderRadius: bare ? 0 : 10,
        background: "var(--paper)",
        display: "block",
      }}
    />
  );
}
