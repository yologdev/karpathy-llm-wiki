import { NextResponse } from "next/server";
import {
  generateAgentToken,
  revokeAgentToken,
  assertCanMutateAgent,
  AgentOwnershipError,
} from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agents/[id]/token — generate (or rotate) the agent's credential.
 *
 * Owner-gated (Clerk session). Returns the raw token **once** — only its hash is
 * stored, so it can't be retrieved later (rotate to get a new one). The owner
 * pastes this into an external runtime (e.g. openclaw) to ingest as the agent.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const existing = await assertCanMutateAgent(id, principal.handle);
    if (!existing) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }
    const token = await generateAgentToken(id);
    return NextResponse.json({ token });
  } catch (err) {
    if (err instanceof AgentOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    logger.error("agents", "token generate failed:", err);
    return NextResponse.json(
      { error: "Failed to generate token." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/agents/[id]/token — revoke the agent's credential. Owner-gated.
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const existing = await assertCanMutateAgent(id, principal.handle);
    if (!existing) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }
    await revokeAgentToken(id);
    return NextResponse.json({ revoked: true });
  } catch (err) {
    if (err instanceof AgentOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    logger.error("agents", "token revoke failed:", err);
    return NextResponse.json(
      { error: "Failed to revoke token." },
      { status: 500 },
    );
  }
}
