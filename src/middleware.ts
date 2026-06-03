import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// HTTP methods that mutate state.
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Closes the unauthenticated-write hole at a single enforcement point:
// any mutating request to /api/** requires a signed-in user. Reads (GET/HEAD)
// stay public — yopedia is a public observer surface (see yopedia-concept.md).
// Attribution (which user) is read per-route from `getPrincipal()`.
//
// Exception: /api/agents/seed authenticates IN-ROUTE because it accepts either
// a Clerk session OR a service token (getServicePrincipal) for automated
// re-seeding. It still rejects unauthenticated callers — the auth just lives in
// the handler, not here — so this is not a hole.
//
// The MCP server is stdio-only and not exposed over HTTP, so it is unaffected.
const IN_ROUTE_AUTH_PATHS = new Set(["/api/agents/seed"]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (
    WRITE_METHODS.has(req.method) &&
    pathname.startsWith("/api/") &&
    !IN_ROUTE_AUTH_PATHS.has(pathname)
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
