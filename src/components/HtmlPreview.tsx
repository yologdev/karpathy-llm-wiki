"use client";

import { useEffect, useRef, useState } from "react";
import {
  composeSrcDoc,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
  HTML_HEIGHT_MESSAGE_KEY,
} from "@/lib/html";

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
export function HtmlPreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);

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
      srcDoc={composeSrcDoc(html)}
      sandbox={HTML_SANDBOX}
      title="HTML output"
      style={{
        width: "100%",
        height,
        border: "1px solid var(--rule)",
        borderRadius: 10,
        background: "var(--paper)",
        display: "block",
      }}
    />
  );
}
