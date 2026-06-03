import { NextResponse } from "next/server";
import { getAgent, resolveAgentPages, sharedPagesFor } from "@/lib/agents";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
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
    const page = await readWikiPageWithFrontmatter(slug);
    if (page) {
      contents.push(page.body);
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

    // Resolve effective pages (own + inherited from the template chain), so a
    // forked per-user yoyo returns the base content it inherits. Plus the pages
    // the owner shared into this agent's context (grant references).
    const pages = await resolveAgentPages(agent);
    const sharedSlugs = await sharedPagesFor(agent.id);

    // Load all context sections in parallel
    const [identity, learnings, social, shared] = await Promise.all([
      loadPages(pages.identityPages),
      loadPages(pages.learningPages),
      loadPages(pages.socialPages),
      loadPages(sharedSlugs),
    ]);

    const totalChars =
      identity.content.length +
      learnings.content.length +
      social.content.length +
      shared.content.length;
    const pageCount =
      identity.count + learnings.count + social.count + shared.count;

    return NextResponse.json({
      agent,
      context: {
        identity: identity.content,
        learnings: learnings.content,
        socialWisdom: social.content,
        shared: shared.content,
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
