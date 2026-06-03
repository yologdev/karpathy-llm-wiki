import { NextResponse } from "next/server";
import { verifyAgentToken, addAgentLearningPage } from "@/lib/agents";
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
 * Authenticated by the **agent's token** (Authorization: Bearer ...), NOT a
 * human session — so an external runtime (e.g. openclaw) can ingest as the
 * agent. The token is self-scoping: it can only ingest into the agent whose id
 * it carries (mismatch → 403). This route is exempt from the middleware
 * write-gate because it uses a token instead of Clerk.
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
    if (!tokenAgentId) {
      return NextResponse.json({ error: "Invalid agent token." }, { status: 401 });
    }
    if (tokenAgentId !== id) {
      return NextResponse.json(
        { error: "This token does not authenticate that agent." },
        { status: 403 },
      );
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
