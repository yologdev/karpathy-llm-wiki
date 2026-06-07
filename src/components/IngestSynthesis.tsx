"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/folio/icons";

/**
 * Step 2 visual: a staged checklist that animates while the single synthesis
 * request is in flight. The backend runs these stages inside one opaque call —
 * there's no per-stage streaming — so this is a *cosmetic* progress indicator.
 * It advances on a timer and holds on the final stage until the parent moves on
 * to the review step (when the request resolves).
 */
const STAGES = [
  ["Fetch", "retrieving & cleaning the source"],
  ["Synthesize", "drafting a cited page"],
  ["Embed", "indexing for semantic search"],
  ["Cross-link", "wikilinks to related pages"],
  ["Score", "confidence & review-by date"],
] as const;

const STEP_MS = 850;

export function IngestSynthesis({ sourceLabel }: { sourceLabel: string }) {
  // How many stages are complete; the next one is "active", the rest pending.
  const [done, setDone] = useState(0);

  useEffect(() => {
    // Advance up to the last stage, then hold (don't mark the final stage done —
    // the parent transitions away once synthesis actually returns).
    const id = setInterval(() => {
      setDone((d) => (d < STAGES.length - 1 ? d + 1 : d));
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      {/* Who's working, on what */}
      <div className="row" style={{ gap: 12, alignItems: "center", marginBottom: 26 }}>
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--rule-strong)",
            background: "var(--paper-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--muted)",
            flexShrink: 0,
          }}
        >
          Y
        </span>
        <p className="receipt" style={{ fontSize: 13.5, margin: 0, minWidth: 0 }}>
          <span style={{ color: "var(--ink)" }}>yoyo is synthesizing</span>{" "}
          <span
            style={{
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sourceLabel}
          </span>
        </p>
      </div>

      {/* Stage checklist */}
      <div>
        {STAGES.map(([name, desc], i) => {
          const isDone = i < done;
          const isActive = i === done;
          return (
            <div
              key={name}
              className="spread"
              style={{
                gap: 12,
                padding: "16px 2px",
                borderTop: i === 0 ? undefined : "1px solid var(--rule)",
                opacity: isDone || isActive ? 1 : 0.45,
                transition: "opacity .3s",
              }}
            >
              <div className="row" style={{ gap: 14, alignItems: "center", minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isDone
                      ? "var(--accent)"
                      : isActive
                        ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                        : "var(--paper-3)",
                    color: "#fff",
                  }}
                >
                  {isDone ? (
                    <Icon.check width="13" height="13" />
                  ) : isActive ? (
                    <span
                      className="animate-pulse"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: "var(--accent)",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: "var(--faint)",
                      }}
                    />
                  )}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-read)",
                    fontSize: 16,
                    color: "var(--ink)",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {name}
                </span>
              </div>
              <span
                className="receipt"
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {desc}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
