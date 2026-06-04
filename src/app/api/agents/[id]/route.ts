import { NextResponse } from "next/server";
import {
  getAgent,
  deleteAgent,
  updateAgent,
  assertCanMutateAgent,
  AgentOwnershipError,
} from "@/lib/agents";
import type { UpdateAgentOptions } from "@/lib/agents";
import { listReadableWikiPages } from "@/lib/wiki";
import { getPrincipal } from "@/lib/auth";
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

    // Drop page slugs the caller can't read — agent knowledge is public by
    // default, but a private (paid) page's slug must not leak via the profile.
    const readable = new Set(
      (await listReadableWikiPages(await getPrincipal())).map((p) => p.slug),
    );
    const keep = (slugs: string[]) => slugs.filter((s) => readable.has(s));
    const safeAgent = {
      ...agent,
      identityPages: keep(agent.identityPages),
      learningPages: keep(agent.learningPages),
      socialPages: keep(agent.socialPages),
    };

    return NextResponse.json({ agent: safeAgent });
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
 * Remove an agent profile. Only the owner may delete it. Returns 200 on
 * success, 403 if not the owner, 404 if not found.
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

    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "Sign in required to delete an agent." },
        { status: 401 },
      );
    }
    // Owns-or-403; also resolves whether the agent exists at all.
    const existing = await assertCanMutateAgent(id, principal.handle);
    if (!existing) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }

    await deleteAgent(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof AgentOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = getErrorMessage(err);
    if (message.includes("Invalid agent ID")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/agents/[id]
 *
 * Partially update an agent profile. Accepts:
 *   - `name?` — new display name
 *   - `description?` — new description
 *   - `addPages?` — array of `{ slug, title, type, content }` to create and link
 *   - `removePages?` — array of slugs to unlink (does NOT delete wiki pages)
 *
 * Only the owner may update (feed) the agent. Returns the updated profile.
 * 403 if not the owner, 404 if agent doesn't exist, 400 for validation.
 */
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Agent ID must be a non-empty string" },
        { status: 400 },
      );
    }

    const principal = await getPrincipal();
    if (!principal) {
      return NextResponse.json(
        { error: "Sign in required to update an agent." },
        { status: 401 },
      );
    }

    let body: UpdateAgentOptions;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    // Owns-or-403; also resolves whether the agent exists (404 below).
    const existing = await assertCanMutateAgent(id, principal.handle);
    if (!existing) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }

    const updated = await updateAgent(id, body);
    if (!updated) {
      return NextResponse.json(
        { error: `Agent "${id}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ agent: updated });
  } catch (err) {
    if (err instanceof AgentOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = getErrorMessage(err);
    if (
      message.includes("Invalid agent ID") ||
      message.includes("must be a non-empty string")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
