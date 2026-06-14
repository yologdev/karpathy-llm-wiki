import { NextResponse } from "next/server";
import { verifyAgentToken, addAgentLearningPage, getAgent } from "@/lib/agents";
import { getServicePrincipal } from "@/lib/auth";
import { ingestUrl, ingest, ingestImage, type IngestOptions } from "@/lib/ingest";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Page `type` that marks ingested content as the agent's scoped knowledge. */
const AGENT_KNOWLEDGE_TYPE = "agent-knowledge";

/** Pattern matching x.com or twitter.com post URLs. */
const X_URL_PATTERN = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i;

/**
 * Derive `sourceType` from the request inputs.
 * - X/Twitter URLs → "x-mention"
 * - Other URLs → "url"
 * - Text-only (no URL) → "text"
 */
function deriveSourceType(url: string, _text: string): "x-mention" | "url" | "text" {
  if (url) {
    return X_URL_PATTERN.test(url) ? "x-mention" : "url";
  }
  return "text";
}

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
 *   - `asOwner: true` (system token OR per-agent token): the page is ingested
 *     as the agent's **human owner's own content** — a normal public page
 *     owned/authored by the owner, in their `/u/<handle>` + the commons, NOT
 *     agent knowledge. For the system token this is the @yoyoevolve "save this
 *     to my wiki" reply flow; for per-agent tokens this is the deliberate
 *     agent→commons publish path (the owner is resolved from the agent record).
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
    // Resolved when needed: system-token path always, per-agent-token path when
    // `asOwner` is requested. Carries the agent's human owner so `asOwner`
    // ingests can attribute the page to them.
    let agentRecord: Awaited<ReturnType<typeof getAgent>> | null = null;
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

    let body: {
      url?: unknown;
      text?: unknown;
      title?: unknown;
      imageUrl?: unknown;
      sourceUrl?: unknown;
      asOwner?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    const text = typeof body.text === "string" ? body.text : "";
    const title = typeof body.title === "string" ? body.title : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!url && !text && !imageUrl) {
      return NextResponse.json(
        { error: "Provide a 'url', 'text', or 'imageUrl' to ingest." },
        { status: 400 },
      );
    }

    // `asOwner` ingests into the human owner's own content. On the system-token
    // path the agent record is already resolved; on the per-agent-token path we
    // resolve it now so the owner is available for attribution.
    const asOwner = body.asOwner === true;
    if (asOwner && !agentRecord) {
      try {
        agentRecord = await getAgent(id);
      } catch (err) {
        if (err instanceof Error && err.message.includes("Invalid agent ID")) {
          agentRecord = null;
        } else {
          throw err;
        }
      }
      if (!agentRecord?.owner) {
        return NextResponse.json(
          { error: "Agent has no registered owner; cannot ingest asOwner." },
          { status: 403 },
        );
      }
    }

    let opts: IngestOptions;
    if (asOwner) {
      // Save into the owner's wiki — a normal page attributed to the user.
      const owner = agentRecord!.owner;
      opts = { author: owner, owner, triggeredBy: owner, sourceType: deriveSourceType(url, text) };
    } else {
      // Ingest as the agent: scoped type, attributed to the agent.
      opts = {
        author: id,
        owner: id,
        triggeredBy: id,
        pageType: AGENT_KNOWLEDGE_TYPE,
      };
    }
    // A caller-provided source URL (e.g. the original X article) is recorded as
    // the page's provenance so the wiki page links back to it. The `url`/
    // `imageUrl` paths set their own source, so this only applies to text.
    const sourceUrl =
      typeof body.sourceUrl === "string" && /^https?:\/\//.test(body.sourceUrl.trim())
        ? body.sourceUrl.trim()
        : undefined;

    const result = imageUrl
      ? await ingestImage({ imageUrl }, { ...opts, title: title || undefined })
      : url
        ? await ingestUrl(url, opts)
        : await ingest(title || "Untitled", text, { ...opts, sourceUrl });

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
