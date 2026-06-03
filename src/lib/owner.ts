/**
 * Site owner identity.
 *
 * yopedia is a single-owner deployment: the owner is the human who runs the
 * site (the deployer's X/Twitter handle). Owner-only surfaces — e.g. the Lint
 * health-check admin tool — are gated on this. Defined by the public
 * `NEXT_PUBLIC_OWNER_HANDLE` env var so the SAME value is available client-side
 * (nav gating) and server-side (API/page gating); it's inlined at build time
 * (see the deploy workflow), so changing the owner requires a redeploy.
 *
 * The client gate is UX only — the real boundary is the server gate on the
 * owner-only API routes and pages.
 */

/** The configured owner handle, or null when unset (→ nobody is the owner). */
export function getOwnerHandle(): string | null {
  const h = process.env.NEXT_PUBLIC_OWNER_HANDLE;
  return h && h.trim() ? h.trim() : null;
}

/** Whether `handle` is the site owner. Case-insensitive; false when unset. */
export function isOwnerHandle(handle: string | null | undefined): boolean {
  const owner = getOwnerHandle();
  return !!owner && !!handle && handle.toLowerCase() === owner.toLowerCase();
}
