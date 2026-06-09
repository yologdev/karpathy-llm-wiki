import Link from "next/link";
import type { SourceEntry } from "@/lib/types";

/**
 * Folio provenance primitives — the visual language of the redesign
 * (`design/ui.jsx`). Pure presentational; the segmented/dot/chip styling lives
 * in the `.conf` / `.fresh` / `.mark` classes in globals.css.
 *
 * Color system: blue = human/primary, graphite = agent, rust = decay/dispute.
 */

/** The brand glyph — overlapping human (filled accent) + agent (ringed graphite)
 *  discs: "one commons, two hands." */
export function Colophon({ size = 22 }: { size?: number }) {
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size * 1.3, height: size }}
      aria-hidden
    >
      <span
        className="absolute left-0 top-0 rounded-full bg-accent"
        style={{ width: size, height: size }}
      />
      <span
        className="absolute right-0 top-0 rounded-full bg-paper"
        style={{ width: size, height: size, border: "2px solid var(--agent)" }}
      />
    </span>
  );
}

/** 5-segment confidence meter. `Math.round(value*5)` bars filled. */
export function Confidence({
  value,
  withLabel,
}: {
  value: number;
  withLabel?: boolean;
}) {
  const n = Math.round(value * 5);
  return (
    <span className="row" style={{ gap: 7 }}>
      <span className="conf" title={`confidence ${value.toFixed(2)}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < n ? "on" : ""} />
        ))}
      </span>
      {withLabel && (
        <span className="receipt text-muted" style={{ fontSize: 11 }}>
          {value.toFixed(2)}
        </span>
      )}
    </span>
  );
}

/** Freshness dot + label keyed off a page's `expiry` (ISO date) vs today. */
export function Freshness({ expiry }: { expiry: string }) {
  const days = Math.round((new Date(expiry).getTime() - Date.now()) / 864e5);
  const cls = days < 0 ? "cold" : days < 30 ? "warn" : "ok";
  const txt =
    days < 0
      ? "expired"
      : days < 30
        ? `review in ${days}d`
        : `fresh · review by ${expiry}`;
  return (
    <span
      className="row receipt"
      style={{
        gap: 6,
        fontSize: 11,
        color: cls === "warn" ? "var(--rust)" : "var(--muted)",
      }}
    >
      <span className={`fresh ${cls}`} /> {txt}
    </span>
  );
}

/** A contributor chip. Human = filled accent dot + `@handle`; agent = ringed
 *  graphite dot + the agent's short name (after `--`), in agent color. When
 *  `href` is set (humans only — agents aren't `/u/<handle>` profiles), the chip
 *  links there while keeping the `.mark` styling. */
export function Mark({
  id,
  agent,
  href,
}: {
  id: string;
  agent?: boolean;
  href?: string;
}) {
  const name = agent && id.includes("--") ? id.split("--").pop() : id;
  const inner = (
    <span
      className={`mark ${agent ? "agent" : "human"}`}
      title={agent ? "agent" : "human contributor"}
    >
      <span className="dot" />
      {agent ? name : "@" + name}
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/** 1-letter monogram. Human = circle (accent-soft); agent = squircle (graphite). */
export function Avatar({
  id,
  agent,
  size = 30,
}: {
  id: string;
  agent?: boolean;
  size?: number;
}) {
  const ch = (agent && id.includes("--") ? id.split("--").pop()! : id)
    .slice(0, 1)
    .toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: agent ? "30%" : "50%",
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        background: agent ? "var(--agent-soft)" : "var(--accent-soft)",
        color: agent ? "var(--agent)" : "var(--accent)",
        border: agent ? "1.5px solid var(--agent)" : "none",
        fontFamily: "var(--font-mono)",
        fontSize: size * 0.4,
        fontWeight: 600,
      }}
    >
      {ch}
    </span>
  );
}

/** Tiny source-type tag. Uses the same provenance union as the trail/sources so
 *  every source type maps to a deliberate short label (the compiler enforces
 *  exhaustiveness). */
export function SrcChip({ type }: { type: SourceEntry["type"] }) {
  const map: Record<SourceEntry["type"], string> = {
    url: "URL",
    text: "TXT",
    "x-mention": "X",
    "wiki-ref": "WIKI",
    image: "IMG",
    pdf: "PDF",
    youtube: "YT",
  };
  return (
    <span
      className="receipt"
      style={{
        fontSize: 9.5,
        letterSpacing: ".1em",
        color: "var(--muted)",
        border: "1px solid var(--rule)",
        padding: "1px 5px",
        borderRadius: 3,
      }}
    >
      {map[type]}
    </span>
  );
}
