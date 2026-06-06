import { describe, it, expect, vi } from "vitest";

// clerkMiddleware runs at module load (`export default clerkMiddleware(...)`);
// stub it so importing the middleware doesn't require a Clerk runtime.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (fn: unknown) => fn,
}));

import { authenticatesInRoute } from "@/middleware";

describe("write-gate in-route auth exemptions", () => {
  it("exempts the service-token-authenticated routes", () => {
    // These authenticate in-route with a token (no Clerk session) — a missing
    // entry silently 401s the caller before it reaches the route.
    expect(authenticatesInRoute("/api/tasks/run")).toBe(true); // task-consumer
    expect(authenticatesInRoute("/api/tasks/scan")).toBe(true); // maintenance cron
    expect(authenticatesInRoute("/api/ingest")).toBe(true);
    expect(authenticatesInRoute("/api/ingest/x-mention")).toBe(true);
    expect(authenticatesInRoute("/api/ingest/batch")).toBe(true);
    expect(authenticatesInRoute("/api/ingest/image")).toBe(true);
    expect(authenticatesInRoute("/api/ingest/pdf")).toBe(true);
    expect(authenticatesInRoute("/api/ingest/reingest")).toBe(true);
    expect(authenticatesInRoute("/api/agents/seed")).toBe(true);
    expect(authenticatesInRoute("/api/agents/alice--yoyo/ingest")).toBe(true);
    expect(authenticatesInRoute("/api/admin/migrate")).toBe(true);
    expect(authenticatesInRoute("/api/admin/reset")).toBe(true);
    expect(authenticatesInRoute("/api/admin/tenant/alice")).toBe(true);
    // Wiki routes: POST /api/wiki (create) and PUT/PATCH/DELETE /api/wiki/:slug
    expect(authenticatesInRoute("/api/wiki")).toBe(true);
    expect(authenticatesInRoute("/api/wiki/transformers")).toBe(true);
  });

  it("does NOT exempt normal write paths (they need a Clerk session)", () => {
    expect(authenticatesInRoute("/api/vault")).toBe(false);
    expect(authenticatesInRoute("/api/tasks/run/extra")).toBe(false);
    // Sub-paths beyond /api/wiki/:slug still go through Clerk
    expect(authenticatesInRoute("/api/wiki/transformers/discuss")).toBe(false);
    expect(authenticatesInRoute("/api/wiki/transformers/revisions")).toBe(false);
  });
});
