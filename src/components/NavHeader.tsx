"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";

const navLinks = [
  { href: "/wiki", label: "Browse" },
  { href: "/wiki/graph", label: "Graph" },
  { href: "/wiki/log", label: "Log" },
  { href: "/raw", label: "Raw" },
  { href: "/ingest", label: "Ingest" },
  { href: "/query", label: "Query" },
  { href: "/lint", label: "Lint" },
];

const utilityLinks = [{ href: "/settings", label: "Settings" }];

function getActiveHref(pathname: string): string | null {
  // Find the nav link with the longest matching prefix.
  // This ensures /wiki/graph matches "Graph" (longer) over "Browse" (/wiki).
  // /wiki/log uses an exact match so it doesn't accidentally highlight under
  // sibling routes (and won't be shadowed by a longer Browse prefix).
  const allLinks = [...navLinks, ...utilityLinks];
  let best: string | null = null;
  for (const { href } of allLinks) {
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

          {/* Search */}
          <li className="mx-1 h-4 w-px bg-foreground/10" aria-hidden="true" />
          <li>
            <GlobalSearch />
          </li>

          {/* Divider + utility links */}
          <li className="mx-1 h-4 w-px bg-foreground/10" aria-hidden="true" />
          {utilityLinks.map(({ href, label }) => {
            const isActive = href === activeHref;

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-semibold bg-foreground/10"
                      : "text-foreground/40 hover:text-foreground hover:bg-foreground/5"
                  }`}
                  title={label}
                >
                  {/* Gear icon for Settings */}
                  {label === "Settings" ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  ) : (
                    label
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <ThemeToggle />
          </li>
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
          {/* Mobile search */}
          <div className="px-4 pb-2">
            <GlobalSearch />
          </div>

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

          {/* Divider + utility links */}
          <div className="mx-4 my-1 border-t border-foreground/10" />
          {utilityLinks.map(({ href, label }) => {
            const isActive = href === activeHref;

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-semibold bg-foreground/10"
                    : "text-foreground/40 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {label}
              </Link>
            );
          })}
          <div className="mx-4 my-1 border-t border-foreground/10" />
          <div className="px-6 py-2 flex items-center gap-2 text-sm text-foreground/40">
            <ThemeToggle />
            <span>Theme</span>
          </div>
        </div>
      )}
    </header>
  );
}
