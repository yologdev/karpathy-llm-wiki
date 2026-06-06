import { NextResponse } from "next/server";
import { listAgents, registerAgent, getAgent, agentIdFor } from "@/lib/agents";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import type { AgentProfile } from "@/lib/types";

/**
 * GET /api/agents
 *
 * Returns all registered agents sorted by ID.
 */
export async function GET() {
  try {
    const agents = await listAgents();
    return NextResponse.json({ agents });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/agents
 *
 * Register a new agent. Body must include: id, name, description. The creating
 * principal becomes the `owner`; only they may later update/delete it.
 * Returns 201 on success, 400 for invalid input, 409 if the agent already
 * exists (use PUT on /api/agents/[id] to update).
 */
export async function POST(req: Request) {
  try {
    // Writes are gated by middleware; resolve the principal to claim ownership.
    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "Sign in required to register an agent." },
        { status: 401 },
      );
    }

    const body = await req.json();

    // Basic presence checks before calling into the lib layer
    const { name, description } = body as Partial<AgentProfile>;
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'name' — must be a non-empty string" },
        { status: 400 },
      );
    }
    // The id is ALWAYS derived from (owner, name) — never trusted from the body —
    // so a caller can only ever create an agent inside their own namespace
    // (`<handle>--<name>`), never under another owner's id.
    const id = agentIdFor(principal.handle, name);
    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'description' — must be a non-empty string" },
        { status: 400 },
      );
    }

    // Check for existing agent (409 conflict)
    const existing = await getAgent(id).catch(() => null);
    if (existing) {
      return NextResponse.json(
        { error: `Agent "${id}" already exists` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const profile: AgentProfile = {
      id,
      name,
      description,
      owner: principal.handle,
      identityPages: Array.isArray(body.identityPages) ? body.identityPages : [],
      learningPages: Array.isArray(body.learningPages) ? body.learningPages : [],
      socialPages: Array.isArray(body.socialPages) ? body.socialPages : [],
      registered: body.registered ?? now,
      lastUpdated: body.lastUpdated ?? now,
    };

    await registerAgent(profile);
    return NextResponse.json({ agent: profile }, { status: 201 });
  } catch (err) {
    const message = getErrorMessage(err);
    // Surface validation errors from the lib layer as 400s
    if (message.includes("Invalid agent ID") || message.includes("requires a non-empty")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
