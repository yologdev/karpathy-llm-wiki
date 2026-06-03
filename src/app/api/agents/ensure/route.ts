import { NextResponse } from "next/server";
import { forkAgent, baseAgentId } from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/agents/ensure
 *
 * Idempotently provision the signed-in user's personal yoyo, forked from the
 * canonical base (`yopedia/yoyo`). Auto-called client-side on sign-in (no
 * button), so it must be cheap and safe to call repeatedly:
 *   - already provisioned → returns the existing agent
 *   - base not seeded yet → `{ provisioned: false }` (not an error)
 *
 * The fork inherits the base's identity/learnings by reference, so it stays in
 * sync with the weekly yoyo-evolve seed until the owner overrides a page.
 */
export async function POST() {
  try {
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const agent = await forkAgent({
      owner: principal.handle,
      templateId: baseAgentId(),
    });

    if (!agent) {
      // Base hasn't been seeded yet — nothing to fork from. Not an error.
      return NextResponse.json({ provisioned: false });
    }

    return NextResponse.json({ agent, provisioned: true });
  } catch (err) {
    // The client's auto-ping ignores the body, so this is the only place a real
    // provisioning failure is observable — log it before returning 500.
    logger.error("agents", "ensure (auto-provision) failed:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
