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
//   - /api/ingest                 — Clerk session OR the system service token
//   - /api/ingest/x-mention       — Clerk session OR the system service token
//   - /api/tasks/run              — the system service token ONLY (the task-
//                                   consumer worker; has no Clerk session)
// This is not a hole.
//
// The MCP server is stdio-only and not exposed over HTTP, so it is unaffected.
const IN_ROUTE_AUTH_PATHS = new Set([
  "/api/agents/seed",
  "/api/ingest",
  "/api/ingest/x-mention",
  // Agent task-queue executor: authenticated in-route by the service token
  // (getServicePrincipal); the sole caller is the task-consumer worker, which
  // has no Clerk session. Rejects everyone else with 401.
  "/api/tasks/run",
  // Admin migration: authenticated in-route by the service token OR the site
  // owner's session (it rejects everyone else with 403).
  "/api/admin/migrate",
]);
const AGENT_INGEST_RE = /^\/api\/agents\/[^/]+\/ingest$/;
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
