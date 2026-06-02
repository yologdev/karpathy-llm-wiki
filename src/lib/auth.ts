// ---------------------------------------------------------------------------
// Auth — resolve the current Clerk principal for attribution
// ---------------------------------------------------------------------------
//
// The unauthenticated-write hole is closed in middleware (any /api write needs
// a session). This module resolves *who* the signed-in user is, for write
// attribution (`owner`/`authors`) — the route never trusts a client-supplied
// author. SSO is Twitter/X, so the principal handle is the Twitter handle.

import { auth, currentUser } from "@clerk/nextjs/server";

export interface Principal {
  /** Stable Clerk user id (never changes). */
  id: string;
  /** Twitter/X handle (falls back to Clerk username, then the user id). */
  handle: string;
}

/** Minimal shape of a Clerk external account we read the handle from. */
interface ExternalAccountLike {
  provider?: string;
  username?: string | null;
}

/** Resolve the Twitter/X handle from a Clerk user, or null. */
function resolveHandle(user: {
  username?: string | null;
  externalAccounts?: ExternalAccountLike[];
} | null): string | null {
  if (!user) return null;
  if (user.username) return user.username;
  const x = user.externalAccounts?.find(
    (a) => typeof a.provider === "string" && /(^|_)(x|twitter)$/i.test(a.provider),
  );
  return x?.username ?? null;
}

/**
 * Resolve the current authenticated principal, or `null` when signed out.
 * Safe to call in route handlers and server components (the request context is
 * populated by `clerkMiddleware`).
 */
export async function getPrincipal(): Promise<Principal | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return { id: userId, handle: resolveHandle(user) ?? userId };
}
