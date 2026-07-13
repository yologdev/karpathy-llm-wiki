/**
 * yopedia logomark — "the living page": a blue page with its earlier
 * revisions stacked behind it. Pages that accumulate — the anti-RAG story.
 * One mark owns every slot (nav, footer, favicon, hero); yoyo stays in the
 * product (rail tender, empty states), out of the brand.
 *
 * Spec: design handoff `Browse Redesign` section 4c. Colors ride the Folio
 * tokens so the mark adapts to dark mode (`--paper` / `--faint` / `--accent`).
 */

type MarkSize = "nav" | "footer" | "full";

interface LivingPageMarkProps {
  className?: string;
  /** Which construction to render: 2-page nav (29×27), 2-page footer
   *  (20×17), or the 3-page full lockup (58×56) for hero/marketing. */
  size?: MarkSize;
}

/** Shared absolutely-positioned page. */
function Page({
  left,
  top,
  width,
  height,
  radius,
  rotate,
  background,
  border,
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  rotate: number;
  background: string;
  border?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        border,
        borderRadius: radius,
        transform: `rotate(${rotate}deg)`,
        background,
        boxSizing: "border-box",
        display: children ? "flex" : undefined,
        flexDirection: children ? "column" : undefined,
        gap: children ? 4 : undefined,
        padding: children ? "9px 7px" : undefined,
      }}
    >
      {children}
    </span>
  );
}

export function LivingPageMark({ className, size = "nav" }: LivingPageMarkProps) {
  if (size === "full") {
    // 3 stacked pages with text-line bars on the front page (hero/marketing).
    return (
      <span
        className={className}
        aria-hidden
        style={{ position: "relative", width: 58, height: 56, display: "inline-block" }}
      >
        <Page
          left={2}
          top={6}
          width={34}
          height={44}
          radius={6}
          rotate={-9}
          background="var(--paper-2)"
          border="1.5px solid var(--rule-strong)"
        />
        <Page
          left={12}
          top={4}
          width={34}
          height={44}
          radius={6}
          rotate={-2}
          background="var(--paper)"
          border="1.5px solid var(--faint)"
        />
        <Page left={22} top={3} width={34} height={44} radius={6} rotate={5} background="var(--accent)">
          <span style={{ height: 3, borderRadius: 2, background: "rgba(251,250,246,.9)", width: "70%" }} />
          <span style={{ height: 3, borderRadius: 2, background: "rgba(251,250,246,.55)", width: "100%" }} />
          <span style={{ height: 3, borderRadius: 2, background: "rgba(251,250,246,.55)", width: "85%" }} />
        </Page>
      </span>
    );
  }

  if (size === "footer") {
    // 2 pages at 11×13 (the quiet sign-off size).
    return (
      <span
        className={className}
        aria-hidden
        style={{ position: "relative", width: 20, height: 17, display: "inline-block" }}
      >
        <Page
          left={0}
          top={2}
          width={11}
          height={13}
          radius={2}
          rotate={-6}
          background="var(--paper)"
          border="1px solid var(--faint)"
        />
        <Page left={6} top={1} width={11} height={13} radius={2} rotate={4} background="var(--accent)" />
      </span>
    );
  }

  // Nav: 2 pages at 17×21, left of the wordmark.
  return (
    <span
      className={className}
      aria-hidden
      style={{ position: "relative", width: 29, height: 27, display: "inline-block" }}
    >
      <Page
        left={1}
        top={4}
        width={17}
        height={21}
        radius={3}
        rotate={-6}
        background="var(--paper)"
        border="1.2px solid var(--faint)"
      />
      <Page left={9} top={3} width={17} height={21} radius={3} rotate={4} background="var(--accent)" />
    </span>
  );
}

interface LogoProps {
  className?: string;
  /** Which mark construction to pair with the wordmark. */
  size?: MarkSize;
  /** Hide the "yopedia" wordmark, showing only the mark. */
  markOnly?: boolean;
}

/** Living-page mark + "yopedia" wordmark, for the nav and footer. */
export function Logo({ className, size = "nav", markOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LivingPageMark size={size} />
      {!markOnly && (
        <span
          className="display text-ink"
          style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em" }}
        >
          yopedia
        </span>
      )}
    </span>
  );
}
