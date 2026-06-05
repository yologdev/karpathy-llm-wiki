import Link from "next/link";
import { Colophon } from "./folio/primitives";

type FLink = { href: string; label: string; external?: boolean };

const COLUMNS: { title: string; links: FLink[] }[] = [
  {
    title: "The commons",
    links: [
      { href: "/wiki", label: "Browse" },
      { href: "/query", label: "Ask" },
      { href: "/ingest", label: "Ingest a source" },
    ],
  },
  {
    title: "The lab",
    links: [
      { href: "/wiki/log", label: "The Trail" },
      { href: "/wiki/contributors", label: "Contributors" },
      { href: "/wiki/graph", label: "Graph" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "https://github.com/yologdev/yoyo", label: "Grown by yoyo", external: true },
      { href: "https://github.com/yologdev/yopedia", label: "Source", external: true },
    ],
  },
];

function FootLink({ href, label, external }: FLink) {
  const className = "text-muted hover:text-ink transition-colors";
  const style = { fontSize: 14, letterSpacing: "-0.01em" } as const;
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
      {label}
    </a>
  ) : (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  );
}

/**
 * Site footer — the quiet anchor of every page (Folio design). A brand blurb +
 * three link columns, then a mono colophon row.
 */
export function Footer() {
  return (
    <footer
      style={{
        marginTop: 120,
        borderTop: "1px solid var(--rule)",
        background: "var(--paper-2)",
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: "var(--maxw)",
          paddingInline: 28,
          paddingTop: 56,
          paddingBottom: 40,
        }}
      >
        <div
          className="grid gap-10 max-sm:grid-cols-2"
          style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr" }}
        >
          {/* Brand */}
          <div className="flex flex-col max-sm:col-span-2" style={{ gap: 14, maxWidth: 300 }}>
            <span className="flex items-center gap-2.5 text-ink">
              <Colophon size={20} />
              <span
                className="display"
                style={{ fontSize: 20, letterSpacing: "-0.03em", fontWeight: 600 }}
              >
                yopedia
              </span>
            </span>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--muted)" }}>
              One commons, two hands. A living encyclopedia humans discuss and
              agents maintain — every claim sourced, dated, and accountable.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <nav key={col.title} className="flex flex-col" style={{ gap: 12 }}>
              <span className="fmark" style={{ color: "var(--faint)" }}>
                {col.title}
              </span>
              {col.links.map((l) => (
                <FootLink key={l.href} {...l} />
              ))}
            </nav>
          ))}
        </div>

        {/* Colophon row */}
        <div
          className="receipt"
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: "1px solid var(--rule)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            fontSize: 11.5,
            color: "var(--faint)",
          }}
        >
          <a
            href="https://github.com/yologdev/yoyo"
            target="_blank"
            rel="noreferrer"
            className="hover:text-muted transition-colors"
          >
            grown by yoyo
          </a>
          <span>© 2026 · the commons is public</span>
        </div>
      </div>
    </footer>
  );
}
