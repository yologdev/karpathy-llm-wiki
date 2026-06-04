"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { isOwnerHandle } from "@/lib/owner";

// Primary actions — shown to everyone, always in the bar.
const primaryLinks = [
  { href: "/wiki", label: "Browse" },
  { href: "/query", label: "Ask" },
  { href: "/ingest", label: "Ingest" },
];

// Secondary / exploration — demoted under a "More" dropdown.
const secondaryLinks = [
  { href: "/wiki/graph", label: "Graph" },
  { href: "/wiki/log", label: "Log" },
  { href: "/wiki/contributors", label: "Contributors" },
];

// Owner-only admin tools (also hard-gated server-side).
const ownerLinks = [{ href: "/lint", label: "Lint" }];

const utilityLinks = [{ href: "/settings", label: "Settings" }];

// Every link that can be "active" — used to highlight the matching nav item.
const ALL_LINKS = [...primaryLinks, ...secondaryLinks, ...ownerLinks, ...utilityLinks];

function getActiveHref(pathname: string): string | null {
  // Longest matching prefix wins (so /wiki/graph beats /wiki). /wiki/log is an
  // exact match so it isn't shadowed by a sibling or the Browse prefix.
  let best: string | null = null;
  for (const { href } of ALL_LINKS) {
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLLIElement>(null);
  const { user } = useUser();
  const handle = user?.username ?? null;
  const profileHref = handle ? `/u/${handle}` : null;
  const isOwner = isOwnerHandle(handle);

  // Lint only appears for the owner; everything else is always in "More".
  const moreLinks = isOwner ? [...secondaryLinks, ...ownerLinks] : secondaryLinks;
  const moreActive = moreLinks.some((l) => l.href === activeHref);

  // Close menus on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // Close the "More" dropdown on an outside click.
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
      <nav aria-label="Main navigation" className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-lg font-bold text-foreground tracking-tight hover:opacity-90 transition-opacity"
        >
          yopedia
        </Link>

        {/* Desktop nav */}
        <ul className="hidden sm:flex items-center gap-1 sm:gap-2">
          {primaryLinks.map(({ href, label }) => {
            const isActive = href === activeHref;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "text-accent font-semibold bg-accent/10"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}

          {/* "More" dropdown — secondary + owner-only links */}
          <li ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                moreActive
                  ? "text-accent font-semibold bg-accent/10"
                  : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              More ▾
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 min-w-40 rounded-md border border-foreground/10 bg-background py-1 shadow-lg"
              >
                {moreLinks.map(({ href, label }) => {
                  const isActive = href === activeHref;
                  return (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      onClick={() => setMoreOpen(false)}
                      className={`block px-4 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "text-accent font-semibold bg-accent/10"
                          : "text-foreground/70 hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}
          </li>

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
                      ? "text-accent font-semibold bg-accent/10"
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

          {/* Auth controls */}
          <li className="mx-1 h-4 w-px bg-foreground/10" aria-hidden="true" />
          <li className="flex items-center gap-2">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="rounded-md px-3 py-1.5 text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton>
                {profileHref && (
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="My pages"
                      labelIcon={<span aria-hidden>📄</span>}
                      href={profileHref}
                    />
                  </UserButton.MenuItems>
                )}
              </UserButton>
            </Show>
          </li>
        </ul>

        {/* Hamburger button (mobile only) */}
        <button
          type="button"
          className="sm:hidden text-foreground/60 hover:text-foreground transition-colors p-1 -mr-1"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle navigation menu"
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

          {primaryLinks.map(({ href, label }) => {
            const isActive = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-accent font-semibold bg-accent/10"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {label}
              </Link>
            );
          })}

          {/* More (secondary + owner-only) */}
          <div className="mx-4 my-1 border-t border-foreground/10" />
          {moreLinks.map(({ href, label }) => {
            const isActive = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`block px-6 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-accent font-semibold bg-accent/10"
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
                    ? "text-accent font-semibold bg-accent/10"
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
          <div className="mx-4 my-1 border-t border-foreground/10" />
          <div className="px-6 py-2 flex items-center gap-3 text-sm">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-foreground/60 hover:text-foreground">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="font-medium text-accent">Sign up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      )}
    </header>
  );
}
