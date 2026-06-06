import { Icon } from "@/components/folio/icons";

/** The 3-step ingest indicator: SOURCE → SYNTHESIS → REVIEW. */
export function IngestStepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "source" },
    { n: 2, label: "synthesis" },
    { n: 3, label: "review" },
  ] as const;

  return (
    <div
      className="row"
      style={{ gap: 0, flexWrap: "wrap", margin: "30px 0 26px" }}
      role="group"
      aria-label={`Ingest step ${current} of 3`}
    >
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <div key={s.n} className="row" style={{ gap: 0, alignItems: "center" }}>
            {/* Node */}
            <span
              aria-current={active ? "step" : undefined}
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                fontWeight: 500,
                flexShrink: 0,
                background: active
                  ? "var(--accent)"
                  : done
                    ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                    : "var(--paper-3)",
                color: active
                  ? "#fff"
                  : done
                    ? "var(--accent)"
                    : "var(--muted)",
              }}
            >
              {done ? <Icon.check width="14" height="14" /> : s.n}
            </span>
            {/* Dash + label */}
            <span
              aria-hidden
              style={{
                width: 14,
                height: 1,
                background: "var(--accent)",
                margin: "0 8px",
                flexShrink: 0,
              }}
            />
            <span
              className="receipt"
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: active ? 600 : 400,
                color: active
                  ? "var(--ink)"
                  : done
                    ? "var(--muted)"
                    : "var(--faint)",
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </span>
            {/* Connector to the next step */}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                style={{
                  width: 48,
                  height: 1,
                  background: "var(--rule-strong)",
                  margin: "0 14px",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
