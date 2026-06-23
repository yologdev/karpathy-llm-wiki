/**
 * Agent→commons publishing — promotes an agent-scoped page to the public
 * commons by stripping its agent type, transferring ownership to the agent's
 * human owner, and triggering the standard lifecycle side-effects.
 */

import { readWikiPageWithFrontmatter, serializeFrontmatter } from "./wiki";
import { writeWikiPageWithSideEffects } from "./lifecycle";
import { isAgentScopedType } from "./page-types";
import { getAgent, registerAgent } from "./agents";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PublishResult {
  slug: string;
  previousType: string;
  owner: string;
  agent: string;
}

// ---------------------------------------------------------------------------
// publishToCommons
// ---------------------------------------------------------------------------

/**
 * Promote an agent-knowledge page to the public commons.
 *
 * Mutations:
 * 1. Strips `type` from frontmatter (no type = normal wiki page)
 * 2. Sets `owner` to the agent's human owner handle
 * 3. Ensures the agent id is in `contributors[]`
 * 4. Rewrites the page via writeWikiPageWithSideEffects (triggers commons sync)
 * 5. Removes the slug from the agent's learningPages
 */
export async function publishToCommons(
  slug: string,
  agentId: string,
): Promise<PublishResult> {
  // 1. Read the page
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) throw new PublishError(`Page not found: ${slug}`);

  // 2. Validate it's agent-scoped
  const currentType =
    typeof page.frontmatter.type === "string"
      ? page.frontmatter.type
      : undefined;
  if (!isAgentScopedType(currentType)) {
    throw new PublishError(
      `Page "${slug}" is not agent-scoped (type: ${currentType ?? "none"}). Nothing to publish.`,
    );
  }

  // 3. Validate the agent exists and owns this page
  const agent = await getAgent(agentId);
  if (!agent) throw new PublishError(`Agent not found: ${agentId}`);

  const pageOwner =
    typeof page.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined;
  if (pageOwner !== agentId) {
    throw new PublishError(
      `Agent "${agentId}" does not own page "${slug}" (owner: ${pageOwner ?? "none"}).`,
    );
  }

  // 4. Resolve the human owner
  const humanOwner = agent.owner;
  if (!humanOwner) {
    throw new PublishError(
      `Agent "${agentId}" has no human owner — cannot publish to commons.`,
    );
  }

  // 5. Build new frontmatter
  const fm = { ...page.frontmatter };
  delete fm.type; // Remove agent-scoped type → becomes commons-eligible
  fm.owner = humanOwner;

  // Ensure agent is in contributors
  const contribs = Array.isArray(fm.contributors)
    ? (fm.contributors as string[])
    : [];
  if (!contribs.includes(agentId)) {
    fm.contributors = [...contribs, agentId];
  }

  // 6. Serialize and write
  const newContent = serializeFrontmatter(fm, page.body);
  const title = typeof fm.title === "string" ? fm.title : page.title;
  const summary = typeof fm.summary === "string" ? fm.summary : "";

  await writeWikiPageWithSideEffects({
    slug,
    title,
    content: newContent,
    summary,
    logOp: "edit",
    logDetails: () => `Published from agent ${agentId} to commons`,
    author: agentId,
    crossRefSource: null, // skip cross-ref — content didn't change
  });

  // 7. Remove from agent's learningPages (fail-soft)
  try {
    if (agent.learningPages?.includes(slug)) {
      agent.learningPages = agent.learningPages.filter((s) => s !== slug);
      agent.lastUpdated = new Date().toISOString();
      await registerAgent(agent);
    }
  } catch {
    // Non-critical — log but don't fail the publish
  }

  return {
    slug,
    previousType: currentType!,
    owner: humanOwner,
    agent: agentId,
  };
}
