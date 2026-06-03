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
import { slugify } from "./slugify";
import { writeWikiPageWithSideEffects } from "./lifecycle";
import { readWikiPageWithFrontmatter, listWikiPages, writeWikiPage } from "./wiki";
import { logger } from "./logger";
import type { AgentProfile } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENTS_DIR_NAME = "agents";

/** Where per-agent credential hashes live — SEPARATE from the public profile
 *  so a secret can never be serialized alongside an agent. */
const AGENT_SECRETS_DIR_NAME = "agent-secrets";

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
// Addressing — an agent is identified by (owner, name)
// ---------------------------------------------------------------------------
//
// Every owner can have their own "yoyo", so the stored id encodes both:
//   id = slugify("<owner>-<name>")   e.g. "yopedia-yoyo", "alice-yoyo"
// This keeps a flat agents/<id>.json registry (and the existing id-based API
// and `agent:<id>` search scope) working unchanged — the id is just composite.

/** The default agent name every user gets. */
export const DEFAULT_AGENT_NAME = "yoyo";

/** The owner handle of the canonical root agent (the synced base). */
export const BASE_AGENT_OWNER = "yopedia";

/**
 * Compose the stable storage id for an agent from its (owner, name).
 *
 * Each part is slugified SEPARATELY and joined with `--`. Because slugify never
 * emits a run of separators, the `--` delimiter is unambiguous and the
 * owner/name boundary cannot be crossed — so a user-chosen short name can't be
 * crafted to collide with another owner's id (e.g. owner `a_b`+`yoyo` →
 * `a-b--yoyo`, owner `a`+`b_yoyo` → `a--b-yoyo`, distinct). The only residual
 * collision is two owner handles that slugify identically, which forkAgent and
 * the seed ownership check guard against.
 */
export function agentIdFor(owner: string, name: string = DEFAULT_AGENT_NAME): string {
  return `${slugify(owner)}--${slugify(name)}`;
}

/** The id of the canonical root agent every per-user yoyo is forked from. */
export function baseAgentId(): string {
  return agentIdFor(BASE_AGENT_OWNER, DEFAULT_AGENT_NAME);
}

/**
 * Recover an agent's short name from its composite id — the inverse of
 * {@link agentIdFor} for the clean `/u/<owner>/a/<name>` URL form. The id is
 * `slugify(owner)--slugify(name)`, so stripping the unambiguous `slugify(owner)--`
 * prefix yields the name slug. Falls back to the full id for unowned/legacy
 * agents (and for any agent whose owner doesn't slugify to a non-empty prefix).
 */
export function agentShortName(agent: AgentProfile): string {
  if (!agent.owner) return agent.id;
  const prefix = `${slugify(agent.owner)}--`;
  return agent.id.startsWith(prefix) ? agent.id.slice(prefix.length) : agent.id;
}

/**
 * Build a "## Related" markdown block that links an agent section page to its
 * siblings, so the agent's pages form a connected cluster in the wiki graph
 * (graph edges come from `[text](slug.md)` links). Star topology: the hub (the
 * first section) links to every other page, and every other page links back to
 * the hub. Returns "" when there are no siblings to link.
 */
function relatedSectionLinks(
  currentSlug: string,
  hubSlug: string,
  sections: SeedAgentSection[],
): string {
  const isHub = currentSlug === hubSlug;
  const targets = sections.filter((s) =>
    isHub ? s.slug !== hubSlug : s.slug === hubSlug && s.slug !== currentSlug,
  );
  if (targets.length === 0) return "";
  const items = targets.map((s) => `- [${s.title}](${s.slug}.md)`).join("\n");
  return `\n\n## Related\n\n${items}`;
}

// ---------------------------------------------------------------------------
// Sharing — "Share with yoyo" (feed-as-grant, recorded on the page)
// ---------------------------------------------------------------------------
//
// A user shares one of their own pages INTO their agent's context by tagging
// the page's frontmatter with `sharedWith: [<agentId>]`. This is a grant
// (read-access reference), not a copy: the page stays the owner's and unchanged
// in the wiki; the agent just also sees it. The relationship lives on the page
// (like `owner`/`contributors`), so it self-cleans on delete and is found by a
// frontmatter scan — and it does NOT inherit down the template chain (your
// grants are yours, not the base's).

/**
 * Slugs the owner has shared into an agent's context (frontmatter `sharedWith`
 * scan). Mirrors the personal-lens scan in {@link slugsForOwner}.
 */
export async function sharedPagesFor(agentId: string): Promise<string[]> {
  const pages = await listWikiPages();
  const out: string[] = [];
  for (const entry of pages) {
    if (entry.slug === "index" || entry.slug === "log") continue;
    // No .catch here — readWikiPage already returns null for missing/ENOENT,
    // so the only thing a catch would swallow is a malformed-frontmatter throw.
    // Let that propagate (same as slugsForOwner) rather than silently dropping
    // a shared page from the agent's context.
    const page = await readWikiPageWithFrontmatter(entry.slug);
    if (!page) continue;
    const shared = Array.isArray(page.frontmatter.sharedWith)
      ? (page.frontmatter.sharedWith as string[])
      : [];
    if (shared.includes(agentId)) out.push(entry.slug);
  }
  return out;
}

/**
 * Add or remove an agent id from a page's `sharedWith` frontmatter. A no-op if
 * the page is already in the requested state. Frontmatter-only write (the body
 * is untouched), so no re-synthesis or re-embedding — just a cheap revision.
 *
 * Ownership/authorization is enforced by the caller: the route checks the actor
 * owns/contributed to the page, and derives the target agent from the session so
 * it is necessarily the actor's own yoyo.
 */
export async function setPageShared(
  slug: string,
  agentId: string,
  shared: boolean,
): Promise<void> {
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) throw new Error(`Page "${slug}" not found`);

  const current = Array.isArray(page.frontmatter.sharedWith)
    ? (page.frontmatter.sharedWith as string[])
    : [];
  if (current.includes(agentId) === shared) return; // already in desired state

  const next = shared
    ? [...current, agentId]
    : current.filter((a) => a !== agentId);

  const frontmatter = { ...page.frontmatter };
  if (next.length > 0) frontmatter.sharedWith = next;
  else delete frontmatter.sharedWith;

  await writeWikiPage(
    slug,
    serializeFrontmatter(frontmatter, page.body),
    agentId,
    shared ? "shared with agent" : "unshared from agent",
  );
}

// ---------------------------------------------------------------------------
// Per-agent credentials — a token an external runtime uses to ingest AS the
// agent (e.g. openclaw). The secret's SHA-256 hash is stored in a SEPARATE
// store (`agent-secrets/<id>.json`), never on the AgentProfile — so an agent
// profile can be serialized anywhere without risk of leaking the secret (no
// publicAgent() discipline needed; leaks are structurally impossible). Token
// format `<agentId>.<secret>` makes verification O(1) and self-scoping: a token
// can only ever authenticate the agent whose id it carries. Show-once + rotate.
// ---------------------------------------------------------------------------

/** Storage-relative path for an agent's credential secret (hash). */
function agentSecretPath(id: string): string {
  return `${AGENT_SECRETS_DIR_NAME}/${id}.json`;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(digest);
}

/** Constant-time string compare (avoids leaking the secret via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Generate (or rotate) an agent's credential. Stores only the SHA-256 hash in
 * the separate secret store and returns the raw token ONCE — format
 * `<agentId>.<secret>`. The caller must enforce that the actor owns the agent.
 */
export async function generateAgentToken(id: string): Promise<string> {
  const agent = await getAgent(id); // validates id + ensures the agent exists
  if (!agent) throw new Error(`Agent "${id}" not found`);

  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = toHex(secretBytes.buffer);

  const tokenHash = await sha256Hex(secret);
  await getStorage().writeFile(
    agentSecretPath(id),
    JSON.stringify({ tokenHash }),
  );

  return `${id}.${secret}`;
}

/**
 * Append a page slug to an agent's own `learningPages` (idempotent). Used when
 * the agent ingests content into its own knowledge. No-op if the agent is gone.
 */
export async function addAgentLearningPage(
  id: string,
  slug: string,
): Promise<void> {
  const agent = await getAgent(id);
  if (!agent) {
    // The agent was just authenticated for this ingest, so a missing record
    // here is an anomaly — the page was written but is now unattached.
    logger.error(
      "agents",
      `addAgentLearningPage: agent "${id}" not found; page "${slug}" left unattached`,
    );
    return;
  }
  if (!agent.learningPages.includes(slug)) {
    agent.learningPages = [...agent.learningPages, slug];
    agent.lastUpdated = new Date().toISOString();
    await registerAgent(agent);
  }
}

/** Revoke an agent's credential (deletes the stored hash). No-op if unset. */
export async function revokeAgentToken(id: string): Promise<void> {
  try {
    await getStorage().deleteFile(agentSecretPath(id));
  } catch (err) {
    if (!isEnoent(err)) throw err; // already absent → nothing to revoke
  }
}

/**
 * Verify an agent bearer token. Returns the agent id it authenticates, or null.
 * Splits `<agentId>.<secret>`, reads the agent's stored hash from the secret
 * store, and constant-time-compares sha256(secret) against it.
 */
export async function verifyAgentToken(token: string): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!secret) return null;
  // Reject a malformed id up front so it can't form a bad storage path.
  if (!AGENT_ID_RE.test(id)) return null;

  let raw: string;
  try {
    raw = await getStorage().readFile(agentSecretPath(id));
  } catch (err) {
    // No secret issued → not a valid token. A real storage failure is OUR
    // problem — surface it (route → 500) rather than masking an outage as an
    // invalid credential, which would make a valid token look revoked.
    if (isEnoent(err)) return null;
    logger.error("agents", "verifyAgentToken: secret read failed:", err);
    throw err;
  }

  let stored: { tokenHash?: unknown };
  try {
    stored = JSON.parse(raw);
  } catch (err) {
    // A corrupt secret file is OUR data-integrity problem, not a bad token —
    // fail closed (null) but log it so it's observable rather than an invisible
    // "valid token looks revoked".
    logger.error("agents", `verifyAgentToken: corrupt secret file for "${id}":`, err);
    return null;
  }
  if (typeof stored.tokenHash !== "string") return null;

  const hash = await sha256Hex(secret);
  return timingSafeEqual(hash, stored.tokenHash) ? id : null;
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

/** Get an agent by its (owner, name) address. Returns null if absent. */
export async function getAgentByOwnerName(
  owner: string,
  name: string = DEFAULT_AGENT_NAME,
): Promise<AgentProfile | null> {
  return getAgent(agentIdFor(owner, name));
}

/**
 * Resolve an agent's EFFECTIVE pages, following its `template` chain.
 *
 * A fork stores only its own pages; everything else is inherited from its
 * template (and the template's template, …). So a freshly forked yoyo with no
 * own pages resolves to exactly the base's pages — and when the base is
 * re-seeded, the fork sees the update. Own pages are unioned on top (additive
 * learnings); de-duplicated, own-first. A depth cap guards against cycles.
 *
 * @param load optional fetcher (defaults to getAgent) — injectable for tests.
 */
export async function resolveAgentPages(
  agent: AgentProfile,
  load: (id: string) => Promise<AgentProfile | null> = getAgent,
): Promise<{ identityPages: string[]; learningPages: string[]; socialPages: string[] }> {
  const identity: string[] = [];
  const learnings: string[] = [];
  const social: string[] = [];

  let current: AgentProfile | null = agent;
  const seen = new Set<string>();
  let depth = 0;
  while (current && depth < 20) {
    if (seen.has(current.id)) break; // cycle guard
    seen.add(current.id);
    identity.push(...(current.identityPages ?? []));
    learnings.push(...(current.learningPages ?? []));
    social.push(...(current.socialPages ?? []));
    current = current.template ? await load(current.template) : null;
    depth++;
  }

  const dedup = (xs: string[]) => [...new Set(xs)];
  return {
    identityPages: dedup(identity),
    learningPages: dedup(learnings),
    socialPages: dedup(social),
  };
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
  // Revoke the credential FIRST so a token can never outlive its agent: if the
  // profile delete then fails, the worst case is a profile with no credential
  // (recoverable), never a live credential for a deleted agent.
  await revokeAgentToken(id);
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

  // Hub for interlinking the agent's pages into one connected graph cluster.
  const hubSlug = options.sections[0]?.slug ?? "";

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

    // Assemble the full markdown: frontmatter + H1 title + content body, plus a
    // "Related" block linking sibling pages so the agent forms a connected
    // cluster in the graph.
    const related = relatedSectionLinks(section.slug, hubSlug, options.sections);
    const bodyWithTitle = `# ${section.title}\n\n${section.content}${related}`;
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

  // Composite id so each owner can have their own "<name>" (e.g. "yopedia-yoyo").
  // Unowned/legacy seeds keep the bare id for back-compat.
  const storedId = options.owner
    ? agentIdFor(options.owner, options.id)
    : options.id;

  // Register (or update) the agent profile. Seeded agents are roots (no template).
  const profile: AgentProfile = {
    id: storedId,
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
  const existingAgent = await getAgent(storedId);
  if (existingAgent) {
    profile.registered = existingAgent.registered;
    profile.owner = existingAgent.owner ?? options.owner;
    // (Credentials live in a separate store, so a re-seed can't touch them.)
  }

  await registerAgent(profile);
  return profile;
}

// ---------------------------------------------------------------------------
// forkAgent — provision a per-user agent that inherits from a template
// ---------------------------------------------------------------------------

/** Options for {@link forkAgent}. */
export interface ForkAgentOptions {
  /** The owner (principal handle) of the new fork. */
  owner: string;
  /** The id of the template to fork from (e.g. the base "yopedia-yoyo"). */
  templateId: string;
  /** Short name for the fork; defaults to {@link DEFAULT_AGENT_NAME}. */
  name?: string;
}

/**
 * Provision a per-user agent forked from a template. Idempotent: if the owner
 * already has this agent, the existing profile is returned untouched.
 *
 * The fork starts with NO own pages — it inherits everything from the template
 * by reference (see {@link resolveAgentPages}), so it tracks base updates until
 * it overrides a page (future). Returns null if the template doesn't exist.
 */
export async function forkAgent(
  options: ForkAgentOptions,
): Promise<AgentProfile | null> {
  const name = options.name ?? DEFAULT_AGENT_NAME;
  const id = agentIdFor(options.owner, name);

  const existing = await getAgent(id);
  if (existing) {
    // Safety: never hand back an agent owned by someone else (only reachable
    // via a rare owner-slug collision). Treat as not-provisionable rather than
    // leak another user's agent.
    if (existing.owner && existing.owner !== options.owner) return null;
    return existing;
  }

  const template = await getAgent(options.templateId);
  if (!template) return null;

  const now = new Date().toISOString();
  const profile: AgentProfile = {
    id,
    name: template.name,
    description: template.description,
    owner: options.owner,
    template: options.templateId,
    // Own pages start empty — everything is inherited from the template.
    identityPages: [],
    learningPages: [],
    socialPages: [],
    registered: now,
    lastUpdated: now,
  };

  await registerAgent(profile);
  return profile;
}
