"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Show, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./folio/ThemeToggle";
import { Colophon, Avatar } from "./folio/primitives";
import { isOwnerHandle } from "@/lib/owner";

// Primary actions — the only links in the bar. Secondary/exploration links
// (Graph, Log, Contributors) live in the footer per the Folio design; owner
// admin (Lint, Settings) lives in the user menu.
const primaryLinks = [
  { href: "/wiki", label: "Browse" },
  { href: "/query", label: "Ask" },
  { href: "/ingest", label: "Ingest" },
  { href: "/save", label: "Save" },
];

/** Which primary link should read as "active" for the current path. */
function getActiveHref(pathname: string): string | null {
  if (pathname === "/query" || pathname.startsWith("/query/")) return "/query";
  if (pathname === "/ingest" || pathname.startsWith("/ingest/")) return "/ingest";
  if (pathname === "/save" || pathname.startsWith("/save/")) return "/save";
  // Browse owns the commons + article reading surfaces.
  if (
    pathname === "/wiki" ||
    pathname.startsWith("/wiki/") ||
    pathname.startsWith("/u/")
  )
    return "/wiki";
  return null;
}

export function NavHeader() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useUser();
  const handle = user?.username ?? null;
  const isOwner = isOwnerHandle(handle);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Translucent + ruled once the page scrolls (Folio nav behavior).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: scrolled
          ? "color-mix(in srgb, var(--paper) 82%, transparent)"
          : "var(--paper)",
        backdropFilter: scrolled ? "saturate(1.8) blur(12px)" : undefined,
        WebkitBackdropFilter: scrolled ? "saturate(1.8) blur(12px)" : undefined,
        borderBottom: `1px solid ${scrolled ? "var(--rule)" : "transparent"}`,
        transition: "background .2s, border-color .2s",
      }}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 items-center justify-between gap-4"
        style={{ maxWidth: "var(--maxw)", paddingInline: 28 }}
      >
        {/* Brand + primary links */}
        <div className="flex items-center" style={{ gap: 22 }}>
          <Link
            href="/"
            className="flex items-center gap-2.5 text-ink hover:opacity-90 transition-opacity"
          >
            <Colophon size={22} />
            <span
              className="display"
              style={{ fontSize: 22, letterSpacing: "-0.03em", fontWeight: 600 }}
            >
              yopedia
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {primaryLinks.map(({ href, label }) => {
              const isActive = href === activeHref;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="transition-colors"
                    style={{
                      display: "inline-block",
                      padding: "7px 13px",
                      borderRadius: 999,
                      fontSize: 14,
                      letterSpacing: "-0.01em",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--ink)" : "var(--muted)",
                      background: isActive ? "var(--paper-3)" : "transparent",
                    }}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Search + theme + auth */}
        <div className="flex items-center" style={{ gap: 10 }}>
          <div className="hidden md:block">
            <GlobalSearch />
          </div>
          <ThemeToggle />

          <Show when="signed-out">
            {/* Invite-only: new visitors join the waitlist (the primary action);
                approved/returning members sign in. Clerk's sign-in modal also
                cross-links to /waitlist via `waitlistUrl`. Hidden below md — the
                hamburger menu carries auth on narrow widths. */}
            <Link
              href="/waitlist"
              className="btn primary hidden md:inline-flex"
              style={{ marginLeft: 2 }}
            >
              Join waitlist
            </Link>
            <SignInButton mode="modal">
              <button
                className="btn ghost hidden md:inline-flex"
                style={{ marginLeft: 2 }}
              >
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <span
              className="hidden items-center md:inline-flex"
              style={{ marginLeft: 2 }}
            >
              <UserButton>
                {
                  <UserButton.MenuItems>
                    <UserButton.Link
                      label="Vault"
                      labelIcon={<span aria-hidden>🗄️</span>}
                      href="/vault"
                    />
                    <UserButton.Link
                      label="Agents"
                      labelIcon={<span aria-hidden>🤖</span>}
                      href="/agents"
                    />
                    {isOwner && (
                      <>
                        <UserButton.Link
                          label="Lint"
                          labelIcon={<span aria-hidden>✓</span>}
                          href="/lint"
                        />
                        <UserButton.Link
                          label="Settings"
                          labelIcon={<span aria-hidden>⚙️</span>}
                          href="/settings"
                        />
                      </>
                    )}
                  </UserButton.MenuItems>
                }
              </UserButton>
            </span>
          </Show>

          {/* Hamburger (mobile only) */}
          <button
            type="button"
            className="btn ghost md:hidden"
            style={{ padding: 8, borderRadius: 10, width: 38, height: 38 }}
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              viewBox="0 0 24 24"
            >
              {mobileOpen ? (
                <path d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            background: "var(--paper)",
            borderTop: "1px solid var(--rule)",
            borderBottom: "1px solid var(--rule)",
            paddingBlock: 10,
          }}
        >
          <div style={{ paddingInline: 22, paddingBottom: 8 }}>
            <GlobalSearch />
          </div>
          {primaryLinks.map(({ href, label }) => {
            const isActive = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block transition-colors"
                style={{
                  paddingInline: 24,
                  paddingBlock: 9,
                  fontSize: 15,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--ink)" : "var(--muted)",
                  background: isActive ? "var(--paper-2)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
          <div
            style={{
              margin: "8px 24px",
              borderTop: "1px solid var(--rule)",
            }}
          />
          <div
            className="flex items-center justify-between"
            style={{ paddingInline: 24, paddingBlock: 6 }}
          >
            <Show when="signed-out">
              <span className="inline-flex items-center gap-2">
                <Link href="/waitlist" className="btn primary">
                  Join waitlist
                </Link>
                <SignInButton mode="modal">
                  <button className="btn ghost">Sign in</button>
                </SignInButton>
              </span>
            </Show>
            <Show when="signed-in">
              <span className="inline-flex items-center gap-2">
                {handle && <Avatar id={handle} size={28} />}
                <UserButton />
              </span>
            </Show>
          </div>
        </div>
      )}
    </header>
  );
}
