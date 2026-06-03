// ---------------------------------------------------------------------------
// Agent registry — Phase 4 agent identity as yopedia pages (data layer)
// ---------------------------------------------------------------------------
//
// Each registered agent gets a JSON file at `agents/<id>.json` under the data
// dir.  The pattern mirrors `discuss/<slug>.json` for talk pages — structured
// data stored as JSON rather than markdown because agent profiles have typed
// fields (arrays, dates) that would be painful to round-trip through
// frontmatter.
// ---------------------------------------------------------------------------

import { getStorage } from "./storage";
import { getDataDir } from "./config";
import { isEnoent } from "./errors";
import { serializeFrontmatter } from "./frontmatter";
import { writeWikiPageWithSideEffects } from "./lifecycle";
import { readWikiPageWithFrontmatter } from "./wiki";
import type { AgentProfile } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENTS_DIR_NAME = "agents";

/** Regex for valid agent IDs: lowercase alphanumeric + hyphens, must start
 *  with a letter or digit (same rules as wiki slugs). */
const AGENT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/** Returns the agents directory path. */
export function getAgentsDir(): string {
  return `${getDataDir()}/${AGENTS_DIR_NAME}`;
}

/** Creates the `agents/` directory if it doesn't exist.
 *  Storage provider creates parent directories on write — this is now a no-op. */
export async function ensureAgentsDir(): Promise<void> {
  /* Storage provider creates parent directories on write — no-op. */
}

/** Storage-relative path for an agent JSON file. */
function agentRelPath(filename: string): string {
  return `${AGENTS_DIR_NAME}/${filename}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate an agent ID. Throws if invalid. */
function validateAgentId(id: string): void {
  if (!id || !AGENT_ID_RE.test(id)) {
    throw new Error(
      `Invalid agent ID "${id}": must match /^[a-z0-9][a-z0-9-]*$/`,
    );
  }
}

/** Validate required fields on an AgentProfile. Throws if missing. */
function validateProfile(profile: AgentProfile): void {
  validateAgentId(profile.id);
  if (!profile.name || typeof profile.name !== "string") {
    throw new Error("Agent profile requires a non-empty 'name'");
  }
  if (!profile.description || typeof profile.description !== "string") {
    throw new Error("Agent profile requires a non-empty 'description'");
  }
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Thrown when an actor tries to mutate an agent they don't own. Routes map
 * this to HTTP 403 (distinct from a 404 for a missing agent).
 */
export class AgentOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentOwnershipError";
  }
}

/**
 * Assert that `actor` (a session principal handle) may mutate agent `id`, and
 * return the existing profile (or null if it doesn't exist yet).
 *
 * A mutation is allowed when:
 *   - the agent doesn't exist yet (this is a creation), OR
 *   - the agent has no recorded owner (legacy/pre-ownership record), OR
 *   - the agent's owner equals `actor`.
 *
 * Otherwise throws {@link AgentOwnershipError}. This is what makes "seed once,
 * then only the owner can re-seed/feed/edit/delete" hold: the first seed claims
 * ownership, and everyone else is read-only against that agent.
 *
 * Also throws a validation error first if `id` is malformed (routes map that to
 * 400, distinct from the 403 ownership rejection).
 */
export async function assertCanMutateAgent(
  id: string,
  actor: string,
): Promise<AgentProfile | null> {
  validateAgentId(id);
  const existing = await getAgent(id);
  if (existing?.owner && existing.owner !== actor) {
    throw new AgentOwnershipError(
      `Agent "${id}" is owned by @${existing.owner}; @${actor} cannot modify it.`,
    );
  }
  return existing;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all registered agents.
 * Returns an empty array if the agents directory doesn't exist yet.
 */
export async function listAgents(): Promise<AgentProfile[]> {
  const storage = getStorage();
  let files: string[];
  try {
    const entries = await storage.listFiles(AGENTS_DIR_NAME);
    files = entries.map((e) => e.name);
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const profiles: AgentProfile[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await storage.readFile(agentRelPath(file));
      profiles.push(JSON.parse(raw) as AgentProfile);
    } catch {
      // Skip malformed files silently — don't let one bad file break the list.
    }
  }

  // Sort alphabetically by ID for stable ordering.
  profiles.sort((a, b) => a.id.localeCompare(b.id));
  return profiles;
}

/**
 * List the agents owned by a given principal handle, sorted by ID.
 * Returns an empty array if the handle owns none (or the registry is empty).
 */
export async function listAgentsForOwner(
  handle: string,
): Promise<AgentProfile[]> {
  const agents = await listAgents();
  return agents.filter((a) => a.owner === handle);
}

/**
 * Get a single agent profile by ID.
 * Returns null if the agent doesn't exist.
 */
export async function getAgent(id: string): Promise<AgentProfile | null> {
  validateAgentId(id);
  try {
    const raw = await getStorage().readFile(agentRelPath(`${id}.json`));
    return JSON.parse(raw) as AgentProfile;
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/**
 * Register (create or update) an agent profile.
 * Validates required fields and writes the profile to disk.
 */
export async function registerAgent(profile: AgentProfile): Promise<void> {
  validateProfile(profile);

  // Ensure arrays default to empty if not provided.
  const normalized: AgentProfile = {
    ...profile,
    identityPages: profile.identityPages ?? [],
    learningPages: profile.learningPages ?? [],
    socialPages: profile.socialPages ?? [],
  };

  await getStorage().writeFile(
    agentRelPath(`${normalized.id}.json`),
    JSON.stringify(normalized, null, 2),
  );
}

/**
 * Delete an agent profile.
 * Returns true if the agent was deleted, false if it didn't exist.
 */
export async function deleteAgent(id: string): Promise<boolean> {
  validateAgentId(id);
  try {
    await getStorage().deleteFile(agentRelPath(`${id}.json`));
    return true;
  } catch (err) {
    if (isEnoent(err)) return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// updateAgent — partial updates to an existing agent profile
// ---------------------------------------------------------------------------

/** A page to add during a partial agent update. */
export interface UpdateAgentPage {
  slug: string;
  title: string;
  type: "identity" | "learnings" | "social";
  /** Markdown content (without frontmatter — frontmatter is generated). */
  content: string;
}

/** Options for {@link updateAgent}. */
export interface UpdateAgentOptions {
  /** Scalar field: new display name. */
  name?: string;
  /** Scalar field: new description. */
  description?: string;
  /** Pages to create and add to the profile's page lists. */
  addPages?: UpdateAgentPage[];
  /** Slugs to remove from the profile's page lists (does NOT delete wiki pages). */
  removePages?: string[];
}

/**
 * Apply a partial update to an existing agent profile.
 *
 * - Scalar fields (`name`, `description`) update in place.
 * - `addPages` creates wiki pages via {@link writeWikiPageWithSideEffects}
 *   and appends slugs to the appropriate page list on the profile.
 * - `removePages` removes slugs from page lists but does NOT delete the
 *   underlying wiki pages (they may be referenced elsewhere).
 * - `lastUpdated` is always bumped.
 *
 * @returns The updated {@link AgentProfile}, or null if the agent doesn't exist.
 */
export async function updateAgent(
  id: string,
  options: UpdateAgentOptions,
): Promise<AgentProfile | null> {
  validateAgentId(id);

  // Fetch existing profile — return null if not found.
  const existing = await getAgent(id);
  if (!existing) return null;

  // Apply scalar updates
  if (options.name !== undefined) {
    if (typeof options.name !== "string" || options.name.trim().length === 0) {
      throw new Error("Agent name must be a non-empty string");
    }
    existing.name = options.name;
  }
  if (options.description !== undefined) {
    if (
      typeof options.description !== "string" ||
      options.description.trim().length === 0
    ) {
      throw new Error("Agent description must be a non-empty string");
    }
    existing.description = options.description;
  }

  // Remove pages from lists (before adding, so add-then-remove of same slug
  // results in removal — simpler mental model).
  if (options.removePages && options.removePages.length > 0) {
    const toRemove = new Set(options.removePages);
    existing.identityPages = existing.identityPages.filter(
      (s) => !toRemove.has(s),
    );
    existing.learningPages = existing.learningPages.filter(
      (s) => !toRemove.has(s),
    );
    existing.socialPages = existing.socialPages.filter(
      (s) => !toRemove.has(s),
    );
  }

  // Add pages — create wiki pages and append slugs to lists.
  if (options.addPages && options.addPages.length > 0) {
    const now = new Date();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const expiryStr = oneYearFromNow.toISOString().slice(0, 10);

    for (const page of options.addPages) {
      // Build frontmatter
      const frontmatter: Record<string, string | string[] | number | boolean> =
        {
          type: "agent-identity",
          authors: [id],
          confidence: 0.9,
          expiry: expiryStr,
          created: now.toISOString(),
          updated: now.toISOString(),
        };

      // If the page already exists, preserve `created` and merge contributors.
      const existingPage = await readWikiPageWithFrontmatter(page.slug).catch(
        () => null,
      );
      if (existingPage) {
        if (existingPage.frontmatter.created) {
          frontmatter.created = existingPage.frontmatter.created;
        }
        const existingContribs = Array.isArray(
          existingPage.frontmatter.contributors,
        )
          ? existingPage.frontmatter.contributors
          : [];
        const contribs = new Set([...existingContribs, id]);
        frontmatter.contributors = [...contribs];
      } else {
        frontmatter.contributors = [id];
      }

      const bodyWithTitle = `# ${page.title}\n\n${page.content}`;
      const fullContent = serializeFrontmatter(frontmatter, bodyWithTitle);

      const summaryLine =
        page.content
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? page.title;
      const summary =
        summaryLine.length > 120
          ? summaryLine.slice(0, 117) + "..."
          : summaryLine;

      await writeWikiPageWithSideEffects({
        slug: page.slug,
        title: page.title,
        content: fullContent,
        summary,
        logOp: "other",
        crossRefSource: null,
        author: id,
      });

      // Append slug to the right list (avoid duplicates)
      const targetList =
        page.type === "identity"
          ? existing.identityPages
          : page.type === "learnings"
            ? existing.learningPages
            : existing.socialPages;
      if (!targetList.includes(page.slug)) {
        targetList.push(page.slug);
      }
    }
  }

  // Bump lastUpdated
  existing.lastUpdated = new Date().toISOString();

  // Persist the updated profile
  await registerAgent(existing);

  return existing;
}

// ---------------------------------------------------------------------------
// seedAgent — create wiki pages for an agent and register them
// ---------------------------------------------------------------------------

/** A content section to create as a wiki page during agent seeding. */
export interface SeedAgentSection {
  type: "identity" | "learnings" | "social";
  slug: string;
  title: string;
  /** Markdown content (without frontmatter — frontmatter is generated). */
  content: string;
}

/** Options for {@link seedAgent}. */
export interface SeedAgentOptions {
  id: string;
  name: string;
  description: string;
  /** Accountable principal handle claiming ownership. Set from the session by
   *  the route, never from client input. Ignored on re-seed if the agent
   *  already has an owner (ownership never transfers via seed). */
  owner?: string;
  /** Content sections to create as wiki pages. */
  sections: SeedAgentSection[];
}

/**
 * Seed an agent by creating wiki pages for each section and registering the
 * agent profile.
 *
 * Each section becomes a wiki page with proper frontmatter:
 *   - `authors: [<agent-id>]`
 *   - `confidence: 0.9` (agent knows itself well)
 *   - `expiry: <1 year from now>` (identity is stable)
 *   - `type: agent-identity`
 *
 * Uses {@link writeWikiPageWithSideEffects} for proper index/crossref/embedding
 * updates. Idempotent — if pages or agent already exist, they are updated
 * rather than duplicated.
 *
 * @returns The registered {@link AgentProfile}.
 */
export async function seedAgent(options: SeedAgentOptions): Promise<AgentProfile> {
  validateAgentId(options.id);
  if (!options.name || typeof options.name !== "string") {
    throw new Error("seedAgent requires a non-empty 'name'");
  }
  if (!options.description || typeof options.description !== "string") {
    throw new Error("seedAgent requires a non-empty 'description'");
  }

  const now = new Date();
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const expiryStr = oneYearFromNow.toISOString().slice(0, 10); // YYYY-MM-DD

  const identityPages: string[] = [];
  const learningPages: string[] = [];
  const socialPages: string[] = [];

  for (const section of options.sections) {
    // Build frontmatter for this page
    const frontmatter: Record<string, string | string[] | number | boolean> = {
      type: "agent-identity",
      authors: [options.id],
      confidence: 0.9,
      expiry: expiryStr,
      created: now.toISOString(),
      updated: now.toISOString(),
    };

    // If the page already exists, preserve its `created` timestamp and
    // merge contributors.
    const existing = await readWikiPageWithFrontmatter(section.slug).catch(
      () => null,
    );
    if (existing) {
      if (existing.frontmatter.created) {
        frontmatter.created = existing.frontmatter.created;
      }
      // Merge existing contributors, ensuring the agent is listed
      const existingContribs = Array.isArray(existing.frontmatter.contributors)
        ? existing.frontmatter.contributors
        : [];
      const contribs = new Set([...existingContribs, options.id]);
      frontmatter.contributors = [...contribs];
    } else {
      frontmatter.contributors = [options.id];
    }

    // Assemble the full markdown: frontmatter + H1 title + content body
    const bodyWithTitle = `# ${section.title}\n\n${section.content}`;
    const fullContent = serializeFrontmatter(frontmatter, bodyWithTitle);

    // Extract a summary (first non-empty line of content, trimmed)
    const summaryLine =
      section.content
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? section.title;
    const summary =
      summaryLine.length > 120
        ? summaryLine.slice(0, 117) + "..."
        : summaryLine;

    await writeWikiPageWithSideEffects({
      slug: section.slug,
      title: section.title,
      content: fullContent,
      summary,
      logOp: "other",
      crossRefSource: null, // skip cross-ref for seeded agent pages
      author: options.id,
    });

    // Bucket the slug into the right page list
    switch (section.type) {
      case "identity":
        identityPages.push(section.slug);
        break;
      case "learnings":
        learningPages.push(section.slug);
        break;
      case "social":
        socialPages.push(section.slug);
        break;
    }
  }

  // Register (or update) the agent profile
  const profile: AgentProfile = {
    id: options.id,
    name: options.name,
    description: options.description,
    owner: options.owner,
    identityPages,
    learningPages,
    socialPages,
    registered: now.toISOString(),
    lastUpdated: now.toISOString(),
  };

  // If the agent already exists, preserve its original registration date and
  // owner — an owned agent never changes hands here. An existing *unowned*
  // (legacy) agent is claimed by this seeder via the `?? options.owner` fallback.
  const existingAgent = await getAgent(options.id);
  if (existingAgent) {
    profile.registered = existingAgent.registered;
    profile.owner = existingAgent.owner ?? options.owner;
  }

  await registerAgent(profile);
  return profile;
}
