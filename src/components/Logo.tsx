/**
 * yopedia logomark — a small node-constellation glyph that ties the brand to
 * the knowledge graph / substrate. Monoline edges in `currentColor`, nodes
 * filled, with the hub node in the indigo accent. Crisp at 16px.
 */

interface LogoMarkProps {
  className?: string;
  /** Pixel size of the square glyph. */
  size?: number;
}

export function LogoMark({ className, size = 24 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* edges */}
      <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.45}>
        <line x1="5" y1="8" x2="12" y2="5" />
        <line x1="12" y1="5" x2="19" y2="10" />
        <line x1="12" y1="5" x2="13" y2="18" />
        <line x1="5" y1="8" x2="13" y2="18" />
        <line x1="13" y1="18" x2="19" y2="10" />
      </g>
      {/* nodes */}
      <circle cx="5" cy="8" r="2" fill="currentColor" />
      <circle cx="19" cy="10" r="2" fill="currentColor" />
      <circle cx="13" cy="18" r="2" fill="currentColor" />
      {/* hub */}
      <circle cx="12" cy="5" r="2.7" fill="var(--accent)" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Pixel size of the glyph (wordmark scales with text). */
  size?: number;
  /** Hide the "yopedia" wordmark, showing only the glyph. */
  markOnly?: boolean;
}

/** Logomark + "yopedia" wordmark, for the nav and footer. */
export function Logo({ className, size = 22, markOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} className="text-foreground" />
      {!markOnly && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          yopedia
        </span>
      )}
    </span>
  );
}
