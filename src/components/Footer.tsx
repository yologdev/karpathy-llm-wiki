import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const FOOTER_LINKS = [
  { href: "/wiki", label: "Browse" },
  { href: "/query", label: "Ask" },
  { href: "/ingest", label: "Ingest" },
  { href: "/wiki/contributors", label: "Contributors" },
];

/**
 * Site footer — a quiet anchor at the bottom of every page. Width-aligned
 * with the nav and homepage container.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-bold tracking-tight text-foreground">
            yopedia
          </span>
          <span className="text-xs text-muted">
            A shared second brain for humans and agents — growing in public.
          </span>
        </div>
        <nav className="flex items-center gap-4">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </footer>
  );
}
