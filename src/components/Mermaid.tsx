"use client";

import { useEffect, useState } from "react";
import { renderMermaid } from "@/lib/mermaid";
import { logger } from "@/lib/logger";

/**
 * Render a Mermaid graph definition (from a ` ```mermaid ` fenced block) to an
 * inline SVG. Mermaid loads lazily on first use. On a syntax error the raw
 * definition is shown as code rather than a blank — never throws into render.
 */
export function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    renderMermaid(chart)
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((err) => {
        if (!cancelled) {
          logger.warn("markdown", "mermaid render failed; showing source", err);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (failed) {
    return (
      <pre>
        <code>{chart}</code>
      </pre>
    );
  }
  if (svg === null) {
    return (
      <div
        className="receipt"
        style={{ color: "var(--muted)", fontSize: 12, padding: "12px 0" }}
      >
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      className="mermaid-diagram"
      style={{ textAlign: "center", margin: "1.25rem 0" }}
      // Mermaid renders with securityLevel "strict" (sanitized labels, no scripts).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
