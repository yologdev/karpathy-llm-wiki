import { NextResponse } from "next/server";
import { getServicePrincipal, getPrincipal } from "@/lib/auth";
import { isOwnerHandle } from "@/lib/owner";
import { migrateToTenants } from "@/lib/migrate-to-tenants";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/migrate
 *
 * Run (or dry-run) the per-tenant silo migration. Gated to the service token
 * OR the site owner's session — everyone else gets 403 (the route is exempt
 * from the blanket write-gate; it authenticates itself).
 *
 * Body: `{ "dry": boolean }`. Defaults to a DRY RUN — you must explicitly pass
 * `{ "dry": false }` to perform the (additive, copy-only) live migration.
 */
export async function POST(req: Request) {
  const service = getServicePrincipal(req);
  const principal = service ?? (await getPrincipal());
  if (!service && !isOwnerHandle(principal?.handle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { dry?: unknown };
    // Fail safe: anything other than an explicit `false` is a dry run.
    const dryRun = body?.dry !== false;
    logger.info(
      "migrate",
      `migration requested by ${principal?.handle ?? "service"} (dryRun=${dryRun})`,
    );
    const result = await migrateToTenants({ dryRun });
    return NextResponse.json(result);
  } catch (err) {
    logger.error("migrate", "migration failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
