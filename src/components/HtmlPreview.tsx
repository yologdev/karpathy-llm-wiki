"use client";

import { useEffect, useRef, useState } from "react";
import {
  composeSrcDoc,
  usesChartLib,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
  HTML_HEIGHT_MESSAGE_KEY,
} from "@/lib/html";
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
      srcDoc={composeSrcDoc(html, chartLib)}
      sandbox={HTML_SANDBOX}
      title="HTML output"
      // The frame auto-sizes to its content (the page scrolls), so normal
      // artifacts show no inner scrollbar. We do NOT force `scrolling="no"`: a
      // self-contained artifact with its own full-viewport (100vh) layout
      // reports a short height, and suppressing the scrollbar would clip it to
      // nothing — letting it scroll keeps the content reachable.
      style={{
        width: "100%",
        height,
        border: bare ? "none" : "1px solid var(--rule)",
        borderRadius: bare ? 0 : 10,
        background: "var(--paper)",
        display: "block",
        ...(bare ? { minHeight: "calc(100dvh - 56px)" } : {}),
      }}
    />
  );
}
