"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const navLinks = [
  { href: "/wiki", label: "Browse" },
  { href: "/wiki/graph", label: "Graph" },
  { href: "/wiki/log", label: "Log" },
  { href: "/raw", label: "Raw" },
  { href: "/ingest", label: "Ingest" },
  { href: "/query", label: "Query" },
  { href: "/lint", label: "Lint" },
];

function getActiveHref(pathname: string): string | null {
  // Find the nav link with the longest matching prefix.
  // This ensures /wiki/graph matches "Graph" (longer) over "Browse" (/wiki).
  // /wiki/log uses an exact match so it doesn't accidentally highlight under
  // sibling routes (and won't be shadowed by a longer Browse prefix).
  let best: string | null = null;
  for (const { href } of navLinks) {
    const matches =
      href === "/wiki/log"
        ? pathname === href
        : pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

export function NavHeader() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu when pathname changes (navigation occurred)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-foreground/10 shadow-sm">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-lg font-bold text-foreground tracking-tight hover:opacity-90 transition-opacity"
        >
          LLM Wiki
        </Link>

        {/* Desktop nav */}
        <ul className="hidden sm:flex items-center gap-1 sm:gap-2">
          {navLinks.map(({ href, label }) => {
            const isActive = href === activeHref;

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-semibold bg-foreground/10"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Hamburger button (mobile only) */}
        <button
          type="button"
          className="sm:hidden text-foreground/60 hover:text-foreground transition-colors p-1 -mr-1"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="sm:hidden absolute top-14 left-0 right-0 bg-background border-b border-foreground/10 py-2 z-50">
          {navLinks.map(({ href, label }) => {
            const isActive = href === activeHref;

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-semibold bg-foreground/10"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
