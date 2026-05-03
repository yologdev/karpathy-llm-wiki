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

import fs from "fs/promises";
import path from "path";
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
  return path.join(getDataDir(), AGENTS_DIR_NAME);
}

/** Creates the `agents/` directory if it doesn't exist. */
export async function ensureAgentsDir(): Promise<void> {
  await fs.mkdir(getAgentsDir(), { recursive: true });
}

/** Path to the JSON file for a given agent. */
function agentFilePath(id: string): string {
  return path.join(getAgentsDir(), `${id}.json`);
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
// Public API
// ---------------------------------------------------------------------------

/**
 * List all registered agents.
 * Returns an empty array if the agents directory doesn't exist yet.
 */
export async function listAgents(): Promise<AgentProfile[]> {
  let files: string[];
  try {
    files = await fs.readdir(getAgentsDir());
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const profiles: AgentProfile[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(getAgentsDir(), file), "utf-8");
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
 * Get a single agent profile by ID.
 * Returns null if the agent doesn't exist.
 */
export async function getAgent(id: string): Promise<AgentProfile | null> {
  validateAgentId(id);
  try {
    const raw = await fs.readFile(agentFilePath(id), "utf-8");
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

  await ensureAgentsDir();
  await fs.writeFile(
    agentFilePath(normalized.id),
    JSON.stringify(normalized, null, 2),
    "utf-8",
  );
}

/**
 * Delete an agent profile.
 * Returns true if the agent was deleted, false if it didn't exist.
 */
export async function deleteAgent(id: string): Promise<boolean> {
  validateAgentId(id);
  try {
    await fs.unlink(agentFilePath(id));
    return true;
  } catch (err) {
    if (isEnoent(err)) return false;
    throw err;
  }
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
    identityPages,
    learningPages,
    socialPages,
    registered: now.toISOString(),
    lastUpdated: now.toISOString(),
  };

  // If the agent already exists, preserve its original registration date
  const existingAgent = await getAgent(options.id);
  if (existingAgent) {
    profile.registered = existingAgent.registered;
  }

  await registerAgent(profile);
  return profile;
}
