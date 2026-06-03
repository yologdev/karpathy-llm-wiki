import { NextResponse } from "next/server";
import { verifyAgentToken, addAgentLearningPage, getAgent } from "@/lib/agents";
import { getServicePrincipal } from "@/lib/auth";
import { ingestUrl, ingest, type IngestOptions } from "@/lib/ingest";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Page `type` that marks ingested content as the agent's scoped knowledge. */
const AGENT_KNOWLEDGE_TYPE = "agent-knowledge";

/**
 * POST /api/agents/[id]/ingest — the agent ingests a source into its OWN
 * knowledge.
 *
 * Authenticated by a Bearer token (NOT a human session), so an external runtime
 * can ingest as the agent. Two credentials are accepted:
 *   - the **agent's own token** — self-scoping; can only ingest into the agent
 *     whose id it carries (mismatch → 403). Used by e.g. openclaw.
 *   - the **system token** — yopedia's trusted automation (e.g. the
 *     @yoyoevolve X-mention loop). It can target any agent, but the agent must
 *     EXIST (404 otherwise), which is how "only ingest for a registered user"
 *     is enforced — a mention from a non-user hits a 404 and is skipped.
 * This route is exempt from the middleware write-gate because it uses a token.
 *
 * Body: { url } or { text, title? }, plus an optional `asOwner` flag.
 *   - Default (per-agent token, e.g. openclaw): the page is scoped
 *     (`type: agent-knowledge`, owned by the agent) and appended to the agent's
 *     learnings — surfaces under the agent profile / `agent:` scope only.
 *   - `asOwner: true` (system token only): the page is ingested as the agent's
 *     **human owner's own content** — a normal public page owned/authored by the
 *     owner, in their `/u/<handle>` + the commons, NOT agent knowledge. This is
 *     the @yoyoevolve "save this to my wiki" reply flow: the actor (a registered
 *     user) replied, so the saved article is theirs, not the agent's.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const bearer = req.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) {
      return NextResponse.json(
        { error: "Agent token required (Authorization: Bearer <token>)." },
        { status: 401 },
      );
    }
    // Resolved only on the system-token path; carries the agent's human owner so
    // `asOwner` ingests can attribute the page to them.
    let agentRecord: Awaited<ReturnType<typeof getAgent>> | null = null;
    let isSystem = false;
    const tokenAgentId = await verifyAgentToken(bearer);
    if (tokenAgentId) {
      // Per-agent token: can only ingest into its own agent.
      if (tokenAgentId !== id) {
        return NextResponse.json(
          { error: "This token does not authenticate that agent." },
          { status: 403 },
        );
      }
    } else if (getServicePrincipal(req)) {
      isSystem = true;
      // System token: trusted to target any agent, but it must exist — this is
      // the "registered user only" gate for the @yoyoevolve loop.
      try {
        agentRecord = await getAgent(id);
      } catch (err) {
        // A malformed id is "not a user" (404). A real storage error must
        // surface as 500 — never masquerade as "not registered", which would
        // make an outage look like nobody who mentioned us is a yopedia user.
        if (err instanceof Error && err.message.includes("Invalid agent ID")) {
          agentRecord = null;
        } else {
          throw err;
        }
      }
      if (!agentRecord) {
        return NextResponse.json(
          { error: `Agent "${id}" not found` },
          { status: 404 },
        );
      }
    } else {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    let body: { url?: unknown; text?: unknown; title?: unknown; asOwner?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    const text = typeof body.text === "string" ? body.text : "";
    const title = typeof body.title === "string" ? body.title : "";
    if (!url && !text) {
      return NextResponse.json(
        { error: "Provide a 'url' or 'text' to ingest." },
        { status: 400 },
      );
    }

    // `asOwner` ingests into the human owner's own content. It requires the
    // system token (which resolved the owner) — an agent token must never be
    // able to write to its owner's public space.
    const asOwner = body.asOwner === true;
    if (asOwner && !isSystem) {
      return NextResponse.json(
        { error: "asOwner ingestion requires the system token." },
        { status: 403 },
      );
    }

    let opts: IngestOptions;
    if (asOwner) {
      // Save into the owner's wiki — a normal page attributed to the user.
      const owner = agentRecord!.owner;
      opts = { author: owner, owner, triggeredBy: owner, sourceType: "x-mention" };
    } else {
      // Ingest as the agent: scoped type, attributed to the agent.
      opts = {
        author: id,
        owner: id,
        triggeredBy: id,
        pageType: AGENT_KNOWLEDGE_TYPE,
      };
    }
    const result = url
      ? await ingestUrl(url, opts)
      : await ingest(title || "Untitled", text, opts);

    // Agent-knowledge ingests attach to the agent's learnings; owner-content
    // ingests do not (they live in the owner's normal content space).
    if (!asOwner) {
      await addAgentLearningPage(id, result.primarySlug);
    }

    return NextResponse.json({
      slug: result.primarySlug,
      deduped: result.deduped ?? false,
    });
  } catch (err) {
    logger.error("agents", "agent ingest failed:", err);
    return NextResponse.json({ error: "Ingest failed." }, { status: 500 });
  }
}
