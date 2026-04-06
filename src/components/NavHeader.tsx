"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/wiki", label: "Browse" },
  { href: "/wiki/graph", label: "Graph" },
  { href: "/ingest", label: "Ingest" },
  { href: "/query", label: "Query" },
  { href: "/lint", label: "Lint" },
];

function getActiveHref(pathname: string): string | null {
  // Find the nav link with the longest matching prefix.
  // This ensures /wiki/graph matches "Graph" (longer) over "Browse" (/wiki).
  let best: string | null = null;
  for (const { href } of navLinks) {
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

export function NavHeader() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <header className="sticky top-0 z-50 h-14 bg-gray-900 border-b border-gray-800">
      <nav className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-lg font-bold text-white tracking-tight hover:opacity-90 transition-opacity"
        >
          LLM Wiki
        </Link>

        <ul className="flex items-center gap-1 sm:gap-2">
          {navLinks.map(({ href, label }) => {
            const isActive = href === activeHref;

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "text-white font-semibold bg-gray-800"
                      : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
