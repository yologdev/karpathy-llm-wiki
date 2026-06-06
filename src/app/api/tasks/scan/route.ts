import { NextResponse } from "next/server";
import { getServicePrincipal } from "@/lib/auth";
import {
  scanForMaintenance,
  rebuildDerivedIndexes,
  DEFAULT_MAINTENANCE_CAP,
} from "@/lib/maintenance";
import { enqueueTask } from "@/lib/tasks";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/tasks/scan — the autonomous-maintenance producer (Q2).
 *
 * Service-token only (the sole caller is the task-consumer worker's cron). Scans
 * the wiki for maintenance work and enqueues `maintain` tasks. Gated by the
 * `AUTONOMOUS_MAINTENANCE` env: anything other than `"on"` means **dry-run** —
 * the scan still runs and logs/returns what it WOULD enqueue, but enqueues
 * nothing. `?dry=1` forces a dry-run regardless (for inspection). `?cap=N`
 * overrides the per-scan task cap.
 */
export async function POST(req: Request) {
  const principal = getServicePrincipal(req);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const enabled = process.env.AUTONOMOUS_MAINTENANCE === "on";
    // Off (default) → always dry-run; never auto-edits until explicitly enabled.
    const dry = url.searchParams.get("dry") === "1" || !enabled;

    const capParam = Number(url.searchParams.get("cap"));
    const cap =
      Number.isFinite(capParam) && capParam > 0
        ? Math.floor(capParam)
        : DEFAULT_MAINTENANCE_CAP;

    const tasks = await scanForMaintenance(cap);

    // Self-heal the precomputed KV indexes (Phase 2) once per scan run. This is
    // read-derived and idempotent — it never edits pages or enqueues tasks — so
    // it runs even in dry-run mode. Fully fail-soft (each rebuild is isolated).
    const indexRebuild = await rebuildDerivedIndexes();

    let enqueued = 0;
    if (!dry) {
      for (const t of tasks) {
        if (await enqueueTask(t)) enqueued++;
      }
    }

    logger.info(
      "maintenance",
      `scan: enabled=${enabled} dry=${dry} found=${tasks.length} enqueued=${enqueued}`,
    );

    return NextResponse.json({
      enabled,
      dry,
      found: tasks.length,
      enqueued,
      indexRebuild,
      // The candidate list — for dry-run inspection of what it would do.
      tasks: tasks.map((t) =>
        t.kind === "maintain"
          ? {
              op: t.op,
              slug: t.slug,
              ...(t.threadIndex !== undefined ? { threadIndex: t.threadIndex } : {}),
            }
          : t,
      ),
    });
  } catch (err) {
    logger.error("maintenance", "scan failed", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
