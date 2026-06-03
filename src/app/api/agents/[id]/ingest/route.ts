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
 * Body: { url } or { text, title? }. The resulting page is scoped
 * (`type: agent-knowledge`, authored/owned by the agent) and appended to the
 * agent's learnings, so it surfaces under the agent profile and `agent:` scope
 * but not in the public feed or general search.
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
      // System token: trusted to target any agent, but it must exist — this is
      // the "registered user only" gate for the @yoyoevolve loop.
      let exists;
      try {
        exists = await getAgent(id);
      } catch (err) {
        // A malformed id is "not a user" (404). A real storage error must
        // surface as 500 — never masquerade as "not registered", which would
        // make an outage look like nobody who mentioned us is a yopedia user.
        if (err instanceof Error && err.message.includes("Invalid agent ID")) {
          exists = null;
        } else {
          throw err;
        }
      }
      if (!exists) {
        return NextResponse.json(
          { error: `Agent "${id}" not found` },
          { status: 404 },
        );
      }
    } else {
      return NextResponse.json({ error: "Invalid token." }, { status: 401 });
    }

    let body: { url?: unknown; text?: unknown; title?: unknown };
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

    // Ingest as the agent: scoped type, attributed to the agent.
    const opts: IngestOptions = {
      author: id,
      owner: id,
      triggeredBy: id,
      pageType: AGENT_KNOWLEDGE_TYPE,
    };
    const result = url
      ? await ingestUrl(url, opts)
      : await ingest(title || "Untitled", text, opts);

    // Attach the ingested page to the agent's own learnings.
    await addAgentLearningPage(id, result.primarySlug);

    return NextResponse.json({
      slug: result.primarySlug,
      deduped: result.deduped ?? false,
    });
  } catch (err) {
    logger.error("agents", "agent ingest failed:", err);
    return NextResponse.json({ error: "Ingest failed." }, { status: 500 });
  }
}
