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

// ---------------------------------------------------------------------------
// Service principal — non-human write credential (scheduled jobs / CI)
// ---------------------------------------------------------------------------
//
// A bearer token lets a trusted automated caller (e.g. the weekly
// seed-yoyo GitHub Action) write WITHOUT a Clerk session. It is intentionally
// narrow: only routes that opt in by calling getServicePrincipal() honor it,
// and it resolves to ONE fixed principal handle (YOPEDIA_SERVICE_PRINCIPAL) so
// everything it writes is attributed and owner-gated like any other user.
//
// Set both as Worker secrets:
//   wrangler secret put YOPEDIA_SERVICE_TOKEN       (a long random string)
//   wrangler secret put YOPEDIA_SERVICE_PRINCIPAL   (the handle it acts as)

/** Extract the bearer token from an Authorization header, or null. */
function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Constant-time string comparison — avoids leaking the token via response
 * timing. Length is allowed to short-circuit (the token is high-entropy, so a
 * length difference is not a useful signal).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Resolve a service principal from a request's bearer token, or `null`.
 *
 * Returns a principal ONLY when both `YOPEDIA_SERVICE_TOKEN` and
 * `YOPEDIA_SERVICE_PRINCIPAL` are configured and the request presents the
 * exact token. The principal's handle is the configured value, so writes are
 * attributed/owned exactly like a human user with that handle.
 */
export function getServicePrincipal(req: Request): Principal | null {
  const expected = process.env.YOPEDIA_SERVICE_TOKEN;
  const handle = process.env.YOPEDIA_SERVICE_PRINCIPAL;
  if (!expected || !handle) return null;

  const provided = bearerToken(req.headers.get("authorization"));
  if (!provided || !timingSafeEqual(provided, expected)) return null;

  return { id: `service:${handle}`, handle };
}
