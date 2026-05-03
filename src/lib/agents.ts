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
