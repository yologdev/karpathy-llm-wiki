import { NextResponse } from "next/server";
import { getServicePrincipal } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { rebuildCommonsIndex } from "@/lib/commons";
import { rebuildDerivedIndexes } from "@/lib/maintenance";
import { clearEmbeddings } from "@/lib/embeddings";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/reset — wipe ALL wiki CONTENT for a from-scratch re-ingest.
 *
 * DESTRUCTIVE + IRREVERSIBLE. Service-token only (the same gate as
 * /api/tasks/run; the middleware write-gate exempts this path so the token
 * caller reaches the handler). Requires an explicit body to prevent accidents:
 *   POST { "confirm": "wipe-content" }
 *
 * Deletes the content prefixes (wiki/, raw/, discuss/, tenants/) and resets the
 * derived indexes + embeddings to an empty wiki. INTENTIONALLY KEEPS agent
 * profiles (agents/), agent credentials (agent-secrets/), and the KV config —
 * so agents + LLM settings survive; you re-ingest pages (and re-seed agent
 * content) on a clean slate.
 */
const CONTENT_PREFIXES = ["wiki", "raw", "discuss", "tenants"] as const;
const CONFIRM_PHRASE = "wipe-content";

export async function POST(req: Request) {
  const principal = getServicePrincipal(req);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let confirm: unknown;
  try {
    const body = (await req.json()) as { confirm?: unknown };
    confirm = body?.confirm;
  } catch {
    /* no / invalid body → falls through to the 400 below */
  }
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: `Destructive content wipe: refusing without confirmation. POST { "confirm": "${CONFIRM_PHRASE}" }.`,
      },
      { status: 400 },
    );
  }

  logger.warn(
    "admin",
    `CONTENT WIPE by ${principal.handle}: deleting ${CONTENT_PREFIXES.join(
      ", ",
    )} (keeping agents/, agent-secrets/, config)`,
  );

  // 1. Delete the content prefixes. agents/ + agent-secrets/ are never touched.
  const storage = getStorage();
  const wiped: Record<string, boolean> = {};
  for (const prefix of CONTENT_PREFIXES) {
    try {
      await storage.deleteDirectory(prefix);
      wiped[prefix] = true;
    } catch (err) {
      logger.error("admin", `content wipe failed for "${prefix}":`, err);
      wiped[prefix] = false;
    }
  }

  // 2. Reset derived state to reflect the now-empty wiki (rebuilds scan the
  //    empty wiki → empty maps; embeddings cleared to an empty store).
  let commons = true;
  try {
    await rebuildCommonsIndex();
  } catch (err) {
    commons = false;
    logger.error("admin", "rebuildCommonsIndex failed:", err);
  }
  const indexes = await rebuildDerivedIndexes();
  let embeddings = true;
  try {
    await clearEmbeddings();
  } catch (err) {
    embeddings = false;
    logger.error("admin", "clear embeddings failed:", err);
  }

  return NextResponse.json({
    ok: true,
    wiped,
    kept: ["agents/", "agent-secrets/", "config"],
    derived: { commons, embeddings, ...indexes },
  });
}
