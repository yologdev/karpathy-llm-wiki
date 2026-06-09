"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps the app's global chrome (nav + footer) so it can be hidden on
 * chrome-less routes. `/share/*` renders bare — just the page content — for a
 * clean, embeddable, shareable view (the share page supplies its own minimal
 * header). The nav/footer are passed in as nodes (rendered on the server) so a
 * client component can conditionally render them without importing them.
 */
export function SiteChrome({
  nav,
  footer,
  children,
}: {
  nav: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const bare = pathname?.startsWith("/share") ?? false;

  if (bare) {
    return (
      <main id="main-content" className="flex-1">
        {children}
      </main>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      {nav}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      {footer}
    </>
  );
}
