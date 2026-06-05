import { NextResponse } from "next/server";
import { getServicePrincipal, getPrincipal } from "@/lib/auth";
import { isOwnerHandle } from "@/lib/owner";
import { tenantForOwner } from "@/lib/wiki";
import { deleteTenant } from "@/lib/tenant-admin";
import { decodeSlug } from "@/lib/slugify";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/admin/tenant/<handle>?confirm=<tenant>
 *
 * Hard-delete a tenant's entire content (see {@link deleteTenant}). Gated to:
 *  - the service token (admin/ops),
 *  - the site owner's session, OR
 *  - the tenant's OWNER themselves (self-serve: deleting your own silo).
 * Everyone else gets 403. The route authenticates itself, so it's exempt from
 * the blanket write-gate (see middleware).
 *
 * Destructive + irreversible, so it requires an explicit `?confirm=<tenant>`
 * matching the target tenant — otherwise 400, nothing deleted.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: encoded } = await params;
  const handle = decodeSlug(encoded);
  const tenant = tenantForOwner(handle);

  const service = getServicePrincipal(req);
  const principal = service ?? (await getPrincipal());
  const isSelf = !!principal && tenantForOwner(principal.handle) === tenant;
  if (!service && !isOwnerHandle(principal?.handle) && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const confirm = new URL(req.url).searchParams.get("confirm");
  if (confirm !== tenant) {
    return NextResponse.json(
      {
        error: `This permanently deletes tenant "${tenant}". Re-send with ?confirm=${tenant} to proceed.`,
      },
      { status: 400 },
    );
  }

  try {
    logger.warn(
      "tenant-admin",
      `deleteTenant "${tenant}" requested by ${principal?.handle ?? "service"}`,
    );
    const result = await deleteTenant(handle);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("tenant-admin", "deleteTenant failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
