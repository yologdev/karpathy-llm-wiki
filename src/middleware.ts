import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// HTTP methods that mutate state.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Closes the unauthenticated-write hole at a single enforcement point:
// any mutating request to /api/** requires a signed-in user. Reads (GET/HEAD)
// stay public — yopedia is a public observer surface (see yopedia-concept.md).
// Attribution (which user) is read per-route from `getPrincipal()`.
//
// Exception: some routes authenticate IN-ROUTE with a token instead of a Clerk
// session, so they're exempt from this gate (they still reject unauthenticated
// callers — the auth just lives in the handler):
//   - /api/agents/seed            — Clerk session OR the system service token
//   - /api/agents/<id>/ingest     — the agent's own per-agent token
//   - /api/agents/<id>/publish    — the agent's own per-agent token
//   - /api/ingest                 — Clerk session OR the system service token
//   - /api/ingest/batch           — Clerk session OR the system service token
//   - /api/ingest/image           — Clerk session OR the system service token
//   - /api/ingest/pdf             — Clerk session OR the system service token
//   - /api/ingest/reingest        — Clerk session OR the system service token
//   - /api/ingest/x-mention       — Clerk session OR the system service token
//   - /api/tasks/run              — the system service token ONLY (the task-
//                                   consumer worker; has no Clerk session)
//   - /api/tasks/scan            — the system service token ONLY (the cron)
//   - /api/wiki                   — Clerk session OR the system service token
//   - /api/wiki/<slug>            — Clerk session OR the system service token
//   - /api/wiki/<slug>/revisions   — Clerk session OR the system service token
//   - /api/mcp                    — remote MCP: Bearer agent/service token (reads need none)
// This is not a hole.
const IN_ROUTE_AUTH_PATHS = new Set([
  "/api/agents/seed",
  // Remote (HTTP) MCP endpoint — authenticates in-route via a Bearer token
  // (per-user agent token or the service token); reads work unauthenticated.
  "/api/mcp",
  "/api/ingest",
  "/api/ingest/batch",
  "/api/ingest/image",
  "/api/ingest/pdf",
  "/api/ingest/reingest",
  "/api/ingest/x-mention",
  // Agent task-queue executor + maintenance scanner: authenticated in-route by
  // the service token (getServicePrincipal); the sole callers are the
  // task-consumer worker (queue handler + cron), which has no Clerk session.
  "/api/tasks/run",
  "/api/tasks/scan",
  // Admin migration: authenticated in-route by the service token OR the site
  // owner's session (it rejects everyone else with 403).
  "/api/admin/migrate",
  // Admin content reset (destructive wipe): service-token only, in-route, with
  // an explicit confirm body. Called with no Clerk session.
  "/api/admin/reset",
  // Admin embedding rebuild: service-token only, in-route. Backfills Vectorize
  // (the settings-page rebuild is disabled on the read-only Workers runtime).
  "/api/admin/rebuild-embeddings",
  // Wiki page creation: authenticated in-route via Clerk session OR the
  // service token (agents create pages via REST).
  "/api/wiki",
]);
const AGENT_INGEST_RE = /^\/api\/agents\/[^/]+\/ingest$/;
const AGENT_PUBLISH_RE = /^\/api\/agents\/[^/]+\/publish$/;
// Wiki page mutations by slug: authenticated in-route via Clerk session OR the
// service token (agents update/patch/delete pages via REST).
// The regex matches /api/wiki/<segment> — but fixed sub-routes (browse,
// dataview, etc.) are NOT slug routes and must NOT be exempted.
const WIKI_SLUG_RE = /^\/api\/wiki\/[^/]+$/;
const WIKI_FIXED_ROUTES = new Set([
  "/api/wiki/browse",
  "/api/wiki/dataview",
  "/api/wiki/export",
  "/api/wiki/graph",
  "/api/wiki/routes",
  "/api/wiki/search",
  "/api/wiki/templates",
]);
// Wiki revision revert: POST /api/wiki/:slug/revisions — authenticated in-route
// via Clerk session OR the service token (automated revert tasks).
const WIKI_REVISIONS_RE = /^\/api\/wiki\/[^/]+\/revisions$/;
// Admin tenant delete: authenticated in-route by the service token, the site
// owner, or the tenant's own owner (it 403s everyone else).
const ADMIN_TENANT_RE = /^\/api\/admin\/tenant\/[^/]+$/;

/**
 * Whether a path authenticates in-route (token, not a Clerk session) and is
 * therefore exempt from the middleware's Clerk write-gate. Exported so the
 * exemption list is regression-tested (a missing entry silently 401s a
 * service-token caller before it reaches the route — see /api/tasks/run).
 */
export function authenticatesInRoute(pathname: string): boolean {
  return (
    IN_ROUTE_AUTH_PATHS.has(pathname) ||
    AGENT_INGEST_RE.test(pathname) ||
    AGENT_PUBLISH_RE.test(pathname) ||
    (WIKI_SLUG_RE.test(pathname) && !WIKI_FIXED_ROUTES.has(pathname)) ||
    WIKI_REVISIONS_RE.test(pathname) ||
    ADMIN_TENANT_RE.test(pathname)
  );
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (
    WRITE_METHODS.has(req.method) &&
    pathname.startsWith("/api/") &&
    !authenticatesInRoute(pathname)
  ) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in required to write to yopedia." },
        { status: 401 },
      );
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static assets, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes and Clerk's auto-proxy path.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
