import { NextResponse } from "next/server";
import { getAgent } from "@/lib/agents";
import { readWikiPage } from "@/lib/wiki";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Separator used between concatenated page contents. */
const PAGE_SEPARATOR = "\n\n---\n\n";

/**
 * Read wiki pages by slug, concatenate their content with a separator.
 * Missing pages are silently skipped with a warning logged.
 */
async function loadPages(slugs: string[]): Promise<{ content: string; count: number }> {
  const contents: string[] = [];
  for (const slug of slugs) {
    const page = await readWikiPage(slug);
    if (page) {
      contents.push(page.content);
    } else {
      logger.warn("agents", `Wiki page "${slug}" not found — skipping`);
    }
  }
  return {
    content: contents.join(PAGE_SEPARATOR),
    count: contents.length,
  };
}

/**
 * GET /api/agents/[id]/context
 *
 * The flagship context endpoint from YOYO.md Phase 4.
 *
 * Returns the agent's identity + learnings + social wisdom in one call,
 * so any project can bootstrap an agent by hitting one URL — no repo coupling.
 *
 * Response shape:
 * {
 *   agent: AgentProfile,
 *   context: {
 *     identity: string,
 *     learnings: string,
 *     socialWisdom: string,
 *   },
 *   meta: {
 *     totalChars: number,
 *     pageCount: number,
 *     generatedAt: string,
 *   }
 * }
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

    // Load all three context sections in parallel
    const [identity, learnings, social] = await Promise.all([
      loadPages(agent.identityPages),
      loadPages(agent.learningPages),
      loadPages(agent.socialPages),
    ]);

    const totalChars =
      identity.content.length + learnings.content.length + social.content.length;
    const pageCount = identity.count + learnings.count + social.count;

    return NextResponse.json({
      agent,
      context: {
        identity: identity.content,
        learnings: learnings.content,
        socialWisdom: social.content,
      },
      meta: {
        totalChars,
        pageCount,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes("Invalid agent ID")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
