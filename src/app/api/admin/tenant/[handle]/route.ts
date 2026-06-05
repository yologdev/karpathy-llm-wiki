import { NextResponse } from "next/server";
import { getServicePrincipal, getPrincipal } from "@/lib/auth";
import { isOwnerHandle } from "@/lib/owner";
import { tenantForOwner, DEFAULT_TENANT } from "@/lib/wiki";
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
  // "self" = same TENANT, not same handle — distinct handles that normalize to
  // the same tenant (e.g. "a.b"/"a-b") share a silo and can self-delete it.
  const isSelf = !!principal && tenantForOwner(principal.handle) === tenant;
  const isAdmin = !!service || isOwnerHandle(principal?.handle);
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The platform tenant holds all seed/shared content — only admins (service
  // token or site owner) may delete it, never a self-serve caller.
  if (tenant === DEFAULT_TENANT && !isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: the platform tenant can only be deleted by an admin." },
      { status: 403 },
    );
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
    // 200 = fully deleted; 207 = partial (some pages failed — see `errors`), so
    // the caller doesn't read a clean 200 as complete success.
    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 207 : 200,
    });
  } catch (err) {
    logger.error("tenant-admin", "deleteTenant failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
