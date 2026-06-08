import { NextResponse } from "next/server";
import { getServicePrincipal } from "@/lib/auth";
import { rebuildVectorStore } from "@/lib/embeddings";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/rebuild-embeddings — re-embed every wiki page into the vector
 * store (Cloudflare Vectorize in production).
 *
 * Service-token only, authenticated IN-ROUTE (no Clerk session), so it runs on
 * the read-only Workers runtime where the settings-page rebuild
 * (`/api/settings/rebuild-embeddings`) is hard-disabled by `isReadOnly()`. This
 * is the way to backfill Vectorize after provisioning or recreating the index.
 */
export async function POST(req: Request) {
  const principal = getServicePrincipal(req);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    logger.warn("admin", `rebuild-embeddings requested by ${principal.handle}`);
    const result = await rebuildVectorStore();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = getErrorMessage(err, "Failed to rebuild vector store");
    // "No embedding provider configured" is a config problem → 400; else 500.
    const status = message.includes("No embedding provider") ? 400 : 500;
    logger.error("admin", "rebuild-embeddings failed:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
