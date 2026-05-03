import { NextResponse } from "next/server";
import { getAgent, deleteAgent } from "@/lib/agents";
import { getErrorMessage } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]
 *
 * Returns a single agent profile by ID. 404 if not found.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Agent ID must be a non-empty string" },
        { status: 400 },
      );
    }

    const agent = await getAgent(id);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ agent });
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes("Invalid agent ID")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/[id]
 *
 * Remove an agent profile. Returns 200 on success, 404 if not found.
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Agent ID must be a non-empty string" },
        { status: 400 },
      );
    }

    const deleted = await deleteAgent(id);
    if (!deleted) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes("Invalid agent ID")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
