// ---------------------------------------------------------------------------
// Auth — resolve the current Clerk principal for attribution
// ---------------------------------------------------------------------------
//
// The unauthenticated-write hole is closed in middleware (any /api write needs
// a session). This module resolves *who* the signed-in user is, for write
// attribution (`owner`/`authors`) — the route never trusts a client-supplied
// author. The principal handle is the Clerk username when set (the email/waitlist
// sign-up flow is configured to require one, so it's the stable basis for
// /u/<handle> URLs); it falls back to a connected Twitter/X handle, then the
// user id, for accounts that lack one (legacy X-only, or if the dashboard
// requirement is relaxed).

import { auth, currentUser } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { logger } from "./logger";

export interface Principal {
  /** Stable Clerk user id (never changes). */
  id: string;
  /** URL/display handle: the Clerk username when set, else a connected
   *  Twitter/X handle, else the user id. */
  handle: string;
}

/** Minimal shape of a Clerk external account we read the handle from. */
interface ExternalAccountLike {
  provider?: string;
  username?: string | null;
}

/**
 * Resolve a user's handle, or null. Prefers the Clerk `username` (the
 * email/waitlist sign-up flow is configured to require one, so it's the stable
 * `/u/<handle>` basis); falls back to a connected Twitter/X account's handle —
 * e.g. for legacy X-only accounts that predate the username requirement, or if
 * that dashboard requirement is ever relaxed — and ultimately to the user id in
 * `getPrincipal`. The fallbacks are why this stays defensive rather than
 * assuming a username is always present.
 */
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
 *
 * Always fails CLOSED — any uncertainty (no request context, or a Clerk
 * failure) yields `null` (anonymous / least privilege) rather than throwing, and
 * the failure is logged so the downgrade isn't silent: `warn` for an `auth()`
 * throw (ambiguous — no context, or a secret-key mismatch) and `error` for a
 * `currentUser()` backend failure (unambiguous). Next's own control-flow errors
 * (e.g. the dynamic-rendering bailout) are re-thrown, not treated as auth
 * failures. See the body.
 */
export async function getPrincipal(): Promise<Principal | null> {
  // getPrincipal is only ever called from request-scoped routes / server
  // components (the cron/queue worker uses getServicePrincipal instead), so at
  // runtime a request context always exists. The two Clerk calls still fail
  // differently, so they get separate catches — a single broad catch would
  // either go silent on real failures or need brittle error-message matching.
  let userId: string | null;
  try {
    ({ userId } = await auth());
  } catch (err) {
    // Let Next's framework control-flow errors propagate untouched — chiefly the
    // "dynamic server usage" bailout thrown when a statically-probed route reads
    // headers() via auth(). Swallowing it would BOTH mislabel a normal build
    // event as an auth failure AND muddy Next's dynamic-render detection.
    unstable_rethrow(err);
    // A genuine auth() throw. auth() only reads the request context — no backend
    // call, per Clerk's server auth() contract — so this is either no request
    // context (a non-request scope) or a CLERK_SECRET_KEY signature mismatch
    // (rotated/misconfigured key) in a live request. Can't cleanly tell them
    // apart, so log at `warn`: suppressed at the test default (level=error) yet
    // visible in production (level=warn). Fail closed regardless.
    logger.warn(
      "auth",
      "auth() threw resolving the principal — no request context or a CLERK_SECRET_KEY mismatch in a live request; treating as anonymous",
      err,
    );
    return null;
  }
  if (!userId) return null;

  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser();
  } catch (err) {
    unstable_rethrow(err); // propagate Next control-flow bailouts, not auth errors
    // We KNOW this user is signed in (auth() returned a userId), but we can't
    // resolve them — a genuine Clerk backend error (outage, bad secret, clock
    // skew). Fail closed (anonymous) so a transient blip can't 500 every caller,
    // but do NOT do it silently: downstream the user is treated as anonymous
    // (private reads 404, writes lose their author), so this must leave a trace.
    logger.error(
      "auth",
      `currentUser() failed for signed-in user ${userId} — treating as anonymous until this clears`,
      err,
    );
    return null;
  }

  const handle = resolveHandle(user);
  if (!handle) {
    // A signed-in user with NO username and NO linked X handle falls back to
    // the raw Clerk id as their handle (ugly /u/<id> URLs + odd attribution).
    // This should never happen under correct config — it signals the Clerk
    // "require username at sign-up" setting is off (this flow depends on it).
    // Don't fail silently: surface it so the misconfig is visible, not buried.
    logger.warn(
      "auth",
      `user ${userId} resolved to no handle (no username, no linked X account) — using the user id; is Clerk's "require username" setting on?`,
    );
  }
  return { id: userId, handle: handle ?? userId };
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
