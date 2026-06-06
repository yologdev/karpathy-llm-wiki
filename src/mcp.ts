#!/usr/bin/env node
/**
 * yopedia MCP server — exposes wiki tools over stdio transport.
 *
 * Tools:
 *   search_wiki    — Search wiki pages by query string
 *   read_page      — Read a single wiki page by slug
 *   list_pages     — List all wiki pages with optional sort/limit
 *   create_page    — Create a new wiki page
 *   update_page    — Update an existing wiki page
 *   update_metadata — Update page frontmatter without changing body
 *   delete_page    — Delete a wiki page by slug
 *   ingest_url     — Ingest a URL into the wiki (fetch → chunk → summarize → write)
 *   batch_ingest_urls — Batch ingest multiple URLs with upfront validation
 *   ingest_text    — Ingest raw text content into the wiki (chunk → summarize → write)
 *   ingest_x_mention — Ingest an X/Twitter post into the wiki with mention provenance
 *   ingest_pdf     — Ingest a PDF document into the wiki by URL
 *   query_wiki     — Ask the wiki a question with LLM synthesis
 *   save_query_answer — Save a query answer as a durable wiki page
 *   agent_context  — Get an agent's full context by agent ID
 *   seed_agent     — Register an agent and create its wiki pages
 *   list_agents    — List all registered agents
 *   update_agent   — Update an existing agent profile
 *   delete_agent   — Delete an agent profile
 *   lint_wiki      — Run quality checks on the wiki
 *   fix_lint_issue — Auto-fix a lint issue found by lint_wiki
 *   list_discussions   — List discussion threads for a wiki page
 *   create_discussion  — Start a new discussion thread
 *   add_comment        — Add a comment to a discussion thread
 *   resolve_discussion — Resolve a discussion thread
 *   reingest           — Re-ingest a wiki page from its original source URL
 *   ingest_history     — View ingest ledger entries for provenance auditing
 *   dataview_query     — Query wiki pages by frontmatter fields
 *   list_revisions     — List revision history for a wiki page
 *   read_revision      — Read a specific revision's content
 *   list_contributors  — List all contributors with trust scores
 *   get_contributor    — Get a specific contributor's trust profile
 *   vault_curate       — Curate a commons page into one of a user's named vaults
 *   vault_uncurate     — Remove a curated page from one of a user's named vaults
 *
 * Usage:
 *   pnpm mcp          # starts the stdio server
 *   echo '{}' | pnpm mcp   # smoke test (exits cleanly)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  searchWikiContent,
  readWikiPage,
  readWikiPageWithFrontmatter,
  listReadableWikiPages,
  validateSlug,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  deleteWikiPage,
  type Frontmatter,
} from "./lib/wiki";
import { canReadFrontmatter } from "./lib/authz";
import { extractSummary, ingest, ingestUrl, ingestPdf, ingestXMention, reingest, readLedger, type LedgerEntry } from "./lib/ingest";
import { query, saveAnswerToWiki, type QueryFormat } from "./lib/query";
import { isUrl } from "./lib/fetch";
import { MAX_BATCH_URLS } from "./lib/constants";
import { getErrorMessage } from "./lib/errors";
import { patchMetadata, type PatchMetadataResult } from "./lib/patch-metadata";
import { getAgent, listAgents, updateAgent, deleteAgent, seedAgent, resolveAgentPages } from "./lib/agents";
import { listContributors, buildContributorProfile } from "./lib/contributors";
import type { SeedAgentSection, UpdateAgentOptions } from "./lib/agents";
import type { AgentProfile, ContributorProfile, IngestResult, QueryResult, LintResult, LintIssue } from "./lib/types";
import type { DeletePageResult } from "./lib/lifecycle";
import { resolveScope, type ContentSearchResult } from "./lib/search";
import { lint, ALL_CHECK_TYPES } from "./lib/lint";
import { fixLintIssue, type FixResult } from "./lib/lint-fix";
import { listThreads, createThread, resolveThread, addComment } from "./lib/talk";
import { queryByFrontmatter, validateQuery, type DataviewFilter, type DataviewQuery, type DataviewResult } from "./lib/dataview";
import { listRevisions, readRevision, readRevisionMeta, type Revision } from "./lib/revisions";
import { vaultIdFor, getVault, createVault, addToVault, removeFromVault } from "./lib/vault";
import { belongsInCommons } from "./lib/commons";
import type { TalkThread, TalkComment } from "./lib/types";

// ---------------------------------------------------------------------------
// Tool handler logic — exported for direct testing without transport
// ---------------------------------------------------------------------------

export async function handleSearchWiki(args: {
  query: string;
  limit?: number | undefined;
  scope?: string | undefined;
}): Promise<{ slug: string; title: string; snippet: string; score: number }[]> {
  const limit = args.limit ?? 10;
  const scope = args.scope ? await resolveScope(args.scope) : undefined;
  const results: ContentSearchResult[] = await searchWikiContent(
    args.query,
    limit,
    scope ?? undefined,
    null, // MCP is unauthenticated — enforce visibility with null principal
  );
  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    snippet: r.snippet,
    score: r.score,
  }));
}

export async function handleReadPage(args: {
  slug: string;
}): Promise<{
  slug: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
}> {
  const page = await readWikiPageWithFrontmatter(args.slug);
  if (!page) {
    throw new Error(`Page not found: ${args.slug}`);
  }
  if (!canReadFrontmatter(page.frontmatter, null)) {
    throw new Error(`Page not found: ${args.slug}`);
  }
  return {
    slug: page.slug,
    title: page.title,
    content: page.body,
    frontmatter: page.frontmatter as Record<string, unknown>,
  };
}

export async function handleListPages(args: {
  sort?: "title" | "updated" | "confidence" | undefined;
  limit?: number | undefined;
}): Promise<
  {
    slug: string;
    title: string;
    tags?: string[];
    confidence?: number;
    updated?: string;
  }[]
> {
  const entries = await listReadableWikiPages(null);

  // Sort
  const sorted = [...entries];
  const sortBy = args.sort ?? "title";
  if (sortBy === "updated") {
    sorted.sort((a, b) => {
      const aDate = a.updated ?? "";
      const bDate = b.updated ?? "";
      return bDate.localeCompare(aDate); // newest first
    });
  } else if (sortBy === "confidence") {
    sorted.sort((a, b) => {
      const aC = a.confidence ?? 0;
      const bC = b.confidence ?? 0;
      return bC - aC; // highest first
    });
  } else {
    // "title" (default)
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Limit
  const limit = args.limit ?? sorted.length;
  const limited = sorted.slice(0, limit);

  return limited.map((e) => ({
    slug: e.slug,
    title: e.title,
    ...(e.tags && e.tags.length > 0 ? { tags: e.tags } : {}),
    ...(e.confidence !== undefined ? { confidence: e.confidence } : {}),
    ...(e.updated ? { updated: e.updated } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Write tool handlers
// ---------------------------------------------------------------------------

/**
 * Extract title from the first `# Heading` in markdown content.
 * Falls back to the provided fallback string.
 */
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

export async function handleCreatePage(args: {
  slug: string;
  content: string;
  author?: string;
  owner?: string;
  tags?: string[];
}): Promise<{ slug: string; title: string; created: true }> {
  validateSlug(args.slug);

  // Check for conflicts
  const existing = await readWikiPage(args.slug);
  if (existing) {
    throw new Error(`Page already exists: ${args.slug}`);
  }

  const title = extractTitle(args.content, args.slug);
  const bodyForSummary = args.content.replace(/^#\s+.+$/m, "").trim();
  const summary = extractSummary(bodyForSummary);
  const today = new Date().toISOString().slice(0, 10);
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 90);
  const expiryDate = expiry.toISOString().slice(0, 10);

  const frontmatter: Frontmatter = {
    title,
    created: today,
    updated: today,
    confidence: 0.5,
    expiry: expiryDate,
    authors: [args.author ?? "agent"],
    valid_from: today,
    disputed: false,
    contributors: [],
    aliases: [],
    tags: Array.isArray(args.tags) ? args.tags : [],
    ...(args.owner ? { owner: args.owner } : {}),
  };

  const fullContent = serializeFrontmatter(frontmatter, args.content);

  await writeWikiPageWithSideEffects({
    slug: args.slug,
    title,
    content: fullContent,
    summary,
    logOp: "ingest",
    author: args.author,
    crossRefSource: args.content,
  });

  return { slug: args.slug, title, created: true };
}

export async function handleUpdatePage(args: {
  slug: string;
  content: string;
  author?: string;
  owner?: string;
}): Promise<{ slug: string; title: string; updated: true }> {
  const existingPage = await readWikiPageWithFrontmatter(args.slug);
  if (!existingPage) {
    throw new Error(`Page not found: ${args.slug}`);
  }

  const title = extractTitle(args.content, existingPage.title);
  const bodyForSummary = args.content.replace(/^#\s+.+$/m, "").trim();
  const summary = extractSummary(bodyForSummary);
  const today = new Date().toISOString().slice(0, 10);

  // Merge frontmatter: preserve existing fields, bump updated, backfill created
  const merged: Frontmatter = {
    ...existingPage.frontmatter,
    title,
    updated: today,
    ...(args.owner && !existingPage.frontmatter.owner ? { owner: args.owner } : {}),
  };
  if (!merged.created) {
    merged.created = today;
  }

  // Track contributors: append the editor if they're not already listed.
  if (args.author) {
    const existingContributors = Array.isArray(merged.contributors)
      ? (merged.contributors as string[])
      : [];
    if (!existingContributors.includes(args.author)) {
      merged.contributors = [...existingContributors, args.author];
    }
  }

  const fullContent = serializeFrontmatter(merged, args.content);

  await writeWikiPageWithSideEffects({
    slug: args.slug,
    title,
    content: fullContent,
    summary,
    logOp: "edit",
    author: args.author,
    crossRefSource: args.content,
  });

  return { slug: args.slug, title, updated: true };
}

// ---------------------------------------------------------------------------
// Update metadata (frontmatter-only) handler
// ---------------------------------------------------------------------------

export async function handleUpdateMetadata(args: {
  slug: string;
  metadata: Record<string, unknown>;
  author?: string;
}): Promise<PatchMetadataResult> {
  return patchMetadata({
    slug: args.slug,
    metadata: args.metadata,
    author: args.author,
    // MCP is deployment-trusted (stdio-only). Act as a service principal so the
    // realm-aware write ACL admits metadata patches on private pages (setting
    // visibility:private stays paid-gated via canSetPrivate, which rejects
    // service principals — unchanged from before).
    principal: { id: "service:mcp", handle: args.author ?? "system" },
  });
}

// ---------------------------------------------------------------------------
// Delete page handler
// ---------------------------------------------------------------------------

export async function handleDeletePage(args: {
  slug: string;
}): Promise<DeletePageResult> {
  return deleteWikiPage(args.slug);
}

// ---------------------------------------------------------------------------
// Ingest URL handler
// ---------------------------------------------------------------------------

export async function handleIngestUrl(args: {
  url: string;
  tags?: string[] | undefined;
  owner?: string;
  triggeredBy?: string;
}): Promise<{
  slug: string;
  title: string;
  summary: string;
  sourceUrl: string;
}> {
  if (!isUrl(args.url)) {
    throw new Error(
      `Invalid URL: "${args.url}" — must start with http:// or https://`,
    );
  }

  const result: IngestResult = await ingestUrl(args.url, {
    ...(args.tags && args.tags.length > 0 ? { tags: args.tags } : {}),
    ...(args.owner ? { owner: args.owner } : {}),
    ...(args.triggeredBy ? { triggeredBy: args.triggeredBy } : {}),
  });

  // Read the written page to extract title and summary for the response
  const page = await readWikiPageWithFrontmatter(result.primarySlug);
  const title = page?.title ?? result.primarySlug;
  const summary = page
    ? extractSummary(page.body)
    : `Ingested from ${args.url}`;

  return {
    slug: result.primarySlug,
    title,
    summary,
    sourceUrl: args.url,
  };
}

// ---------------------------------------------------------------------------
// Batch ingest handler
// ---------------------------------------------------------------------------

export interface BatchIngestResult {
  url: string;
  slug?: string;
  error?: string;
}

export async function handleBatchIngest(args: {
  urls: string[];
  tags?: string[] | undefined;
  owner?: string;
  triggeredBy?: string;
}): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: BatchIngestResult[];
}> {
  const { urls, tags, owner, triggeredBy } = args;

  // Enforce batch size limit
  if (urls.length > MAX_BATCH_URLS) {
    throw new Error(
      `Too many URLs: ${urls.length} exceeds the maximum batch size of ${MAX_BATCH_URLS}`,
    );
  }

  // Validate all URLs upfront — reject the whole batch if any are malformed
  const malformed: { index: number; url: string }[] = [];
  for (let i = 0; i < urls.length; i++) {
    if (!isUrl(urls[i])) {
      malformed.push({ index: i, url: urls[i] });
    }
  }

  if (malformed.length > 0) {
    throw new Error(
      `Malformed URLs at indices ${malformed.map((m) => m.index).join(", ")}: ${malformed.map((m) => `"${m.url}"`).join(", ")}. Fix them and retry the entire batch.`,
    );
  }

  // Ingest each URL sequentially, collecting per-URL results
  const results: BatchIngestResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const result: IngestResult = await ingestUrl(url, {
        ...(tags && tags.length > 0 ? { tags } : {}),
        ...(owner ? { owner } : {}),
        ...(triggeredBy ? { triggeredBy } : {}),
      });
      results.push({ url, slug: result.primarySlug });
      succeeded++;
    } catch (err) {
      results.push({ url, error: getErrorMessage(err) });
      failed++;
    }
  }

  return { total: urls.length, succeeded, failed, results };
}

// ---------------------------------------------------------------------------
// Ingest text handler
// ---------------------------------------------------------------------------

export async function handleIngestText(args: {
  content: string;
  title?: string | undefined;
  tags?: string[] | undefined;
  owner?: string;
  triggeredBy?: string;
}): Promise<{
  slug: string;
  title: string;
  summary: string;
  sourceUrl: string;
}> {
  if (!args.content || args.content.trim().length === 0) {
    throw new Error("content is required and must be non-empty");
  }

  const title = args.title ?? (extractSummary(args.content).slice(0, 80) || "Untitled");

  const result: IngestResult = await ingest(title, args.content, {
    ...(args.tags && args.tags.length > 0 ? { tags: args.tags } : {}),
    sourceType: "text",
    ...(args.owner ? { owner: args.owner } : {}),
    ...(args.triggeredBy ? { triggeredBy: args.triggeredBy } : {}),
  });

  // Read the written page to extract title and summary for the response
  const page = await readWikiPageWithFrontmatter(result.primarySlug);
  const pageTitle = page?.title ?? result.primarySlug;
  const summary = page
    ? extractSummary(page.body)
    : `Ingested from text input`;

  return {
    slug: result.primarySlug,
    title: pageTitle,
    summary,
    sourceUrl: "",
  };
}

// ---------------------------------------------------------------------------
// Ingest X mention handler
// ---------------------------------------------------------------------------

/** Pattern matching x.com or twitter.com post URLs. */
const X_URL_PATTERN = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i;

export async function handleIngestXMention(args: {
  url: string;
  triggered_by: string;
}): Promise<{
  slug: string;
  title: string;
  summary: string;
  sourceUrl: string;
}> {
  if (!args.url || args.url.trim().length === 0) {
    throw new Error("url is required and must be a non-empty string");
  }

  if (!X_URL_PATTERN.test(args.url.trim())) {
    throw new Error("url must be an x.com or twitter.com URL");
  }

  if (!args.triggered_by || args.triggered_by.trim().length === 0) {
    throw new Error("triggered_by is required and must be a non-empty string");
  }

  const result: IngestResult = await ingestXMention(
    args.url.trim(),
    args.triggered_by.trim(),
  );

  // Read the written page to extract title and summary for the response
  const page = await readWikiPageWithFrontmatter(result.primarySlug);
  const title = page?.title ?? result.primarySlug;
  const summary = page
    ? extractSummary(page.body)
    : `Ingested from ${args.url}`;

  return {
    slug: result.primarySlug,
    title,
    summary,
    sourceUrl: args.url.trim(),
  };
}

// ---------------------------------------------------------------------------
// Ingest PDF handler
// ---------------------------------------------------------------------------

export async function handleIngestPdf(args: {
  pdf_url: string;
  title?: string | undefined;
  tags?: string[] | undefined;
  owner?: string;
  triggeredBy?: string;
}): Promise<{
  slug: string;
  title: string;
  summary: string;
  sourceUrl: string;
}> {
  if (!args.pdf_url || !isUrl(args.pdf_url.trim())) {
    throw new Error(
      `Invalid URL: "${args.pdf_url}" — must start with http:// or https://`,
    );
  }

  const result = await ingestPdf(
    { pdfUrl: args.pdf_url.trim() },
    {
      ...(args.title ? { title: args.title } : {}),
      ...(args.tags && args.tags.length > 0 ? { tags: args.tags } : {}),
      ...(args.owner ? { owner: args.owner } : {}),
      ...(args.triggeredBy ? { triggeredBy: args.triggeredBy } : {}),
    },
  );

  // Read the written page to extract title and summary for the response
  const page = await readWikiPageWithFrontmatter(result.primarySlug);
  const pageTitle = page?.title ?? result.primarySlug;
  const summary = page
    ? extractSummary(page.body)
    : `Ingested PDF from ${args.pdf_url}`;

  return {
    slug: result.primarySlug,
    title: pageTitle,
    summary,
    sourceUrl: args.pdf_url.trim(),
  };
}

// ---------------------------------------------------------------------------
// Query wiki handler
// ---------------------------------------------------------------------------

export async function handleQueryWiki(args: {
  question: string;
  format?: "prose" | "table" | "slides" | undefined;
  scope?: string | undefined;
}): Promise<QueryResult> {
  const format: QueryFormat = args.format ?? "prose";
  return query(args.question, format, args.scope);
}

// ---------------------------------------------------------------------------
// Save query answer handler
// ---------------------------------------------------------------------------

export async function handleSaveQueryAnswer(args: {
  question: string;
  answer: string;
  slug?: string | undefined;
  sources?: string[] | undefined;
}): Promise<{ slug: string; success: boolean }> {
  if (!args.question || args.question.trim().length === 0) {
    throw new Error("question is required and must be non-empty");
  }
  if (!args.answer || args.answer.trim().length === 0) {
    throw new Error("answer is required and must be non-empty");
  }

  const result = await saveAnswerToWiki(
    args.question.trim(),
    args.answer.trim(),
    args.slug?.trim() || undefined,
    args.sources,
  );

  return { slug: result.slug, success: true };
}

// ---------------------------------------------------------------------------
// Agent context handler
// ---------------------------------------------------------------------------

/** Separator used between concatenated page contents (matches API route). */
const PAGE_SEPARATOR = "\n\n---\n\n";

/**
 * Load wiki pages by slug, concatenate their content.
 * Missing pages are silently skipped (returns empty string for that section).
 */
async function loadPages(slugs: string[]): Promise<{ content: string; count: number }> {
  const contents: string[] = [];
  for (const slug of slugs) {
    const page = await readWikiPageWithFrontmatter(slug);
    if (page) {
      contents.push(page.body);
    }
  }
  return {
    content: contents.join(PAGE_SEPARATOR),
    count: contents.length,
  };
}

export async function handleAgentContext(args: {
  agent_id: string;
}): Promise<{
  agent: AgentProfile;
  context: {
    identity: string;
    learnings: string;
    socialWisdom: string;
  };
  meta: {
    totalChars: number;
    pageCount: number;
  };
}> {
  const agent = await getAgent(args.agent_id);
  if (!agent) {
    throw new Error("Agent not found");
  }

  // Resolve effective pages (own + inherited from the template chain), so a
  // forked per-user yoyo returns the base content it inherits.
  const pages = await resolveAgentPages(agent);

  const [identity, learnings, social] = await Promise.all([
    loadPages(pages.identityPages),
    loadPages(pages.learningPages),
    loadPages(pages.socialPages),
  ]);

  const totalChars =
    identity.content.length +
    learnings.content.length +
    social.content.length;
  const pageCount = identity.count + learnings.count + social.count;

  return {
    agent,
    context: {
      identity: identity.content,
      learnings: learnings.content,
      socialWisdom: social.content,
    },
    meta: {
      totalChars,
      pageCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Seed agent handler
// ---------------------------------------------------------------------------

export async function handleSeedAgent(args: {
  agent_id: string;
  name: string;
  description: string;
  owner?: string;
  sections: {
    slug: string;
    title: string;
    type: "identity" | "learnings" | "social";
    content: string;
  }[];
}): Promise<AgentProfile> {
  const sections: SeedAgentSection[] = args.sections.map((s) => ({
    slug: s.slug,
    title: s.title,
    type: s.type,
    content: s.content,
  }));

  return seedAgent({
    id: args.agent_id,
    name: args.name,
    description: args.description,
    sections,
    ...(args.owner ? { owner: args.owner } : {}),
  });
}

// ---------------------------------------------------------------------------
// Agent management handlers (list, update, delete)
// ---------------------------------------------------------------------------

export async function handleListAgents(): Promise<{
  agents: { id: string; name: string; description: string; registered: string; lastUpdated: string }[];
}> {
  const agents = await listAgents();
  return {
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      registered: a.registered,
      lastUpdated: a.lastUpdated,
    })),
  };
}

export async function handleUpdateAgent(args: {
  agent_id: string;
  name?: string | undefined;
  description?: string | undefined;
  addPages?: {
    slug: string;
    title: string;
    type: "identity" | "learnings" | "social";
    content: string;
  }[] | undefined;
  removePages?: string[] | undefined;
}): Promise<AgentProfile> {
  const options: UpdateAgentOptions = {};
  if (args.name !== undefined) options.name = args.name;
  if (args.description !== undefined) options.description = args.description;
  if (args.addPages !== undefined) options.addPages = args.addPages;
  if (args.removePages !== undefined) options.removePages = args.removePages;

  const result = await updateAgent(args.agent_id, options);
  if (!result) {
    throw new Error(`Agent not found: ${args.agent_id}`);
  }
  return result;
}

export async function handleDeleteAgent(args: {
  agent_id: string;
}): Promise<{ deleted: boolean; agent_id: string }> {
  const deleted = await deleteAgent(args.agent_id);
  if (!deleted) {
    throw new Error(`Agent not found: ${args.agent_id}`);
  }
  return { deleted: true, agent_id: args.agent_id };
}

// ---------------------------------------------------------------------------
// Contributor handlers
// ---------------------------------------------------------------------------

export async function handleListContributors(): Promise<{
  contributors: ContributorProfile[];
}> {
  const contributors = await listContributors();
  return { contributors };
}

export async function handleGetContributor(args: {
  handle: string;
}): Promise<ContributorProfile> {
  const profile = await buildContributorProfile(args.handle);
  // buildContributorProfile returns a zeroed-out profile for unknown handles.
  // Treat zero activity as "not found" for agent consumers.
  if (
    profile.editCount === 0 &&
    profile.commentCount === 0 &&
    profile.threadsCreated === 0
  ) {
    throw new Error(`No activity found for contributor: ${args.handle}`);
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Vault handlers
// ---------------------------------------------------------------------------

export async function handleVaultCurate(args: {
  slug: string;
  owner: string;
  vault: string;
}): Promise<{ curated: true; slug: string; owner: string; vault: string }> {
  // Validate slug exists and is a commons page
  const page = await readWikiPageWithFrontmatter(args.slug);
  if (!page) {
    throw new Error(`Page not found: ${args.slug}`);
  }
  if (
    !belongsInCommons({
      visibility:
        typeof page.frontmatter.visibility === "string"
          ? page.frontmatter.visibility
          : undefined,
      type:
        typeof page.frontmatter.type === "string"
          ? page.frontmatter.type
          : undefined,
    })
  ) {
    throw new Error(
      "Only public commons pages can be curated into a vault.",
    );
  }
  // Resolve the named vault, creating it (public) on first use.
  const id = vaultIdFor(args.owner, args.vault);
  if (!(await getVault(id))) {
    await createVault(args.owner, args.vault, "public");
  }
  await addToVault(id, args.slug);
  return { curated: true, slug: args.slug, owner: args.owner, vault: args.vault };
}

export async function handleVaultUncurate(args: {
  slug: string;
  owner: string;
  vault: string;
}): Promise<{ curated: false; slug: string; owner: string; vault: string }> {
  await removeFromVault(vaultIdFor(args.owner, args.vault), args.slug);
  return { curated: false, slug: args.slug, owner: args.owner, vault: args.vault };
}

// ---------------------------------------------------------------------------
// Lint handlers
// ---------------------------------------------------------------------------

const VALID_CHECK_TYPES = new Set<string>(ALL_CHECK_TYPES);

export async function handleLintWiki(args: {
  checks?: string[] | undefined;
  minSeverity?: string | undefined;
}): Promise<LintResult> {
  // Validate check types if provided
  if (args.checks) {
    const invalid = args.checks.filter((c) => !VALID_CHECK_TYPES.has(c));
    if (invalid.length > 0) {
      throw new Error(
        `Invalid check type(s): ${invalid.join(", ")}. Valid types: ${ALL_CHECK_TYPES.join(", ")}`,
      );
    }
  }

  // Validate minSeverity if provided
  const validSeverities = new Set(["error", "warning", "info"]);
  if (args.minSeverity !== undefined && !validSeverities.has(args.minSeverity)) {
    throw new Error(
      `Invalid minSeverity: "${args.minSeverity}". Valid values: error, warning, info`,
    );
  }

  return lint({
    ...(args.checks ? { checks: args.checks as LintIssue["type"][] } : {}),
    ...(args.minSeverity ? { minSeverity: args.minSeverity as LintIssue["severity"] } : {}),
  });
}

export async function handleFixLintIssue(args: {
  type: string;
  slug: string;
  target?: string | undefined;
  message?: string | undefined;
}): Promise<FixResult> {
  return fixLintIssue(args.type, args.slug, args.target, args.message);
}

// ---------------------------------------------------------------------------
// Discussion (talk page) handlers
// ---------------------------------------------------------------------------

export async function handleListDiscussions(args: {
  pageSlug: string;
}): Promise<{
  pageSlug: string;
  threads: {
    index: number;
    title: string;
    status: string;
    author: string;
    commentCount: number;
    created: string;
    updated: string;
  }[];
}> {
  const threads = await listThreads(args.pageSlug);
  return {
    pageSlug: args.pageSlug,
    threads: threads.map((t, i) => ({
      index: i,
      title: t.title,
      status: t.status,
      author: t.comments[0]?.author ?? "unknown",
      commentCount: t.comments.length,
      created: t.created,
      updated: t.updated,
    })),
  };
}

export async function handleCreateDiscussion(args: {
  pageSlug: string;
  title: string;
  body: string;
  author: string;
}): Promise<TalkThread> {
  if (!args.pageSlug) {
    throw new Error("pageSlug is required");
  }
  if (!args.title || !args.title.trim()) {
    throw new Error("title must be a non-empty string");
  }
  if (!args.body || !args.body.trim()) {
    throw new Error("body must be a non-empty string");
  }
  if (!args.author || !args.author.trim()) {
    throw new Error("author must be a non-empty string");
  }
  return createThread(args.pageSlug, args.title.trim(), args.author.trim(), args.body.trim());
}

export async function handleResolveDiscussion(args: {
  pageSlug: string;
  threadIndex: number;
  resolution: "open" | "resolved" | "wontfix";
}): Promise<TalkThread> {
  if (!args.pageSlug) {
    throw new Error("pageSlug is required");
  }
  if (args.threadIndex === undefined || args.threadIndex === null) {
    throw new Error("threadIndex is required");
  }
  if (!args.resolution) {
    throw new Error("resolution is required");
  }
  if (args.resolution !== "open" && args.resolution !== "resolved" && args.resolution !== "wontfix") {
    throw new Error(
      `Invalid resolution: "${args.resolution}". Must be "open", "resolved", or "wontfix"`,
    );
  }
  return resolveThread(args.pageSlug, args.threadIndex, args.resolution);
}

export async function handleAddComment(args: {
  pageSlug: string;
  threadIndex: number;
  content: string;
  author?: string | undefined;
  parentId?: string | undefined;
}): Promise<TalkComment> {
  if (!args.pageSlug) {
    throw new Error("pageSlug is required");
  }
  if (args.threadIndex === undefined || args.threadIndex === null) {
    throw new Error("threadIndex is required");
  }
  if (!args.content || !args.content.trim()) {
    throw new Error("content must be a non-empty string");
  }
  const author = args.author && args.author.trim() ? args.author.trim() : "anonymous";
  return addComment(args.pageSlug, args.threadIndex, author, args.content.trim(), args.parentId);
}

// ---------------------------------------------------------------------------
// Re-ingest handler
// ---------------------------------------------------------------------------

export async function handleReingest(args: {
  slug: string;
}): Promise<IngestResult> {
  if (!args.slug) {
    throw new Error("slug is required");
  }
  return reingest(args.slug);
}

// ---------------------------------------------------------------------------
// Ingest history handler
// ---------------------------------------------------------------------------

export async function handleIngestHistory(args: {
  limit?: number | undefined;
}): Promise<{ entries: LedgerEntry[] }> {
  const limit = args.limit ?? 50;
  const entries = await readLedger(limit);
  return { entries };
}

export async function handleDataviewQuery(args: {
  filters?: Array<{ field: string; op: string; value?: string }>;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
}): Promise<{ results: DataviewResult[]; total: number }> {
  const query: DataviewQuery = {
    filters: args.filters as DataviewFilter[] | undefined,
    sortBy: args.sortBy,
    sortOrder: args.sortOrder as "asc" | "desc" | undefined,
    limit: args.limit,
  };

  // validateQuery throws descriptive errors on bad input
  validateQuery(query);

  const results = await queryByFrontmatter(query);
  return { results, total: results.length };
}

export async function handleListRevisions(args: {
  slug: string;
}): Promise<{ slug: string; revisions: Revision[] }> {
  if (!args.slug) {
    throw new Error("slug is required");
  }
  validateSlug(args.slug);

  // Verify the page exists before listing revisions.
  const page = await readWikiPage(args.slug);
  if (!page) {
    throw new Error(`page not found: ${args.slug}`);
  }

  const revisions = await listRevisions(args.slug);
  return { slug: args.slug, revisions };
}

export async function handleReadRevision(args: {
  slug: string;
  timestamp: number;
}): Promise<{ slug: string; timestamp: number; content: string; revision: Revision }> {
  if (!args.slug) {
    throw new Error("slug is required");
  }
  validateSlug(args.slug);

  if (typeof args.timestamp !== "number" || !Number.isFinite(args.timestamp) || args.timestamp <= 0) {
    throw new Error("timestamp must be a positive number");
  }

  // Verify the page exists.
  const page = await readWikiPage(args.slug);
  if (!page) {
    throw new Error(`page not found: ${args.slug}`);
  }

  const content = await readRevision(args.slug, args.timestamp);
  if (content === null) {
    throw new Error(`revision not found: ${args.timestamp}`);
  }

  // Read optional author/reason sidecar.
  const meta = await readRevisionMeta(args.slug, args.timestamp);

  return {
    slug: args.slug,
    timestamp: args.timestamp,
    content,
    revision: {
      timestamp: args.timestamp,
      date: new Date(args.timestamp).toISOString(),
      slug: args.slug,
      sizeBytes: Buffer.byteLength(content, "utf-8"),
      ...(meta?.author !== undefined && { author: meta.author }),
      ...(meta?.reason !== undefined && { reason: meta.reason }),
    },
  };
}

// ---------------------------------------------------------------------------
// MCP server setup
// ---------------------------------------------------------------------------

const SERVER_INSTRUCTIONS = `yopedia is a shared knowledge wiki for humans and agents. It accumulates durable, citable knowledge — not ephemeral RAG results. Every page has confidence scores, expiry dates, cited sources, and revision history. Contradictions are tracked and resolved through talk pages.

## Recommended workflow

1. **Search first.** Use \`search_wiki\` before creating anything — the topic may already exist. Use \`dataview_query\` to filter pages by frontmatter fields (tags, confidence, authors).
2. **Read before writing.** Use \`read_page\` to understand existing content, structure, and sources before making changes.
3. **Contribute carefully.** Use \`create_page\` for new topics and \`update_page\` to improve existing pages. Always provide an \`author\` handle for attribution and an \`owner\` handle to set page ownership. Include sources when possible.
4. **Ingest from URLs.** Use \`ingest_url\` or \`ingest_text\` to bring external knowledge into the wiki — the system chunks, summarizes, and creates/updates pages automatically. Pass \`owner\` and \`triggeredBy\` so pages are properly attributed.
5. **Ask questions.** Use \`query_wiki\` for LLM-synthesized answers grounded in wiki content. Use \`save_query_answer\` to promote good answers into durable wiki pages.

## Governance model

- **Confidence** (0–1): every page declares how well-supported its claims are. Low-confidence pages need more sources.
- **Expiry** (ISO date): pages go stale. Check expiry and reingest or update when needed.
- **Sources**: every page tracks its sources with type, URL, and fetch date. Prefer cited claims over unsourced ones.
- **Talk pages**: use \`list_discussions\`, \`create_discussion\`, and \`add_comment\` to discuss disputes or propose changes. Resolve threads with \`resolve_discussion\`.
- **Revisions**: all edits are tracked. Use \`list_revisions\` and \`read_revision\` to review history.
- **Lint**: use \`lint_wiki\` to find quality issues (orphans, broken links, stale pages, contradictions). Use \`fix_lint_issue\` to auto-fix them.

## Agent identity

Agents can register with \`seed_agent\` and retrieve their full context (identity, learnings, social wisdom) via \`agent_context\`. Use \`list_agents\` to see registered agents.

## Key conventions

- Page slugs are kebab-case (e.g. \`machine-learning\`).
- Cross-references use \`[[slug]]\` wikilinks or \`[Title](slug.md)\` markdown links.
- Every page should link to at least one other page to avoid orphans.
- Include an \`author\` field on writes so contributions are properly attributed.
- Include an \`owner\` field on writes to assign page ownership — required for the "Mine" view, private visibility, and the tenant model.`;

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "yopedia",
    version: "1.0.0",
  }, {
    instructions: SERVER_INSTRUCTIONS,
  });

  // search_wiki — Search wiki pages
  server.registerTool("search_wiki", {
    description: "Search yopedia wiki pages by query string",
    inputSchema: {
      query: z.string().describe("Search query"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results (default 10)"),
      scope: z
        .string()
        .optional()
        .describe("Scope search to an agent's pages, e.g. 'agent:yoyo'"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const results = await handleSearchWiki(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // read_page — Read a single wiki page
  server.registerTool("read_page", {
    description: "Read a single yopedia wiki page by slug",
    inputSchema: {
      slug: z.string().describe("Page slug (e.g. 'neural-networks')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const page = await handleReadPage(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(page, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // list_pages — List all wiki pages
  server.registerTool("list_pages", {
    description:
      "List all yopedia wiki pages with optional sort and limit",
    inputSchema: {
      sort: z
        .enum(["title", "updated", "confidence"])
        .optional()
        .describe("Sort order (default: title)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of pages to return"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const pages = await handleListPages(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(pages, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // create_page — Create a new wiki page
  server.registerTool("create_page", {
    description: "Create a new yopedia wiki page with the given slug and markdown content",
    inputSchema: {
      slug: z.string().describe("URL-safe page slug (e.g. 'neural-networks')"),
      content: z.string().describe("Markdown body for the new page (include a # Heading for the title)"),
      author: z.string().optional().describe("Author handle for attribution (defaults to 'agent')"),
      owner: z.string().optional().describe("Owner handle — the accountable principal for this page. Required for 'Mine' view, private visibility, and tenant model. Typically your user handle."),
      tags: z.array(z.string()).optional().describe("Tags to categorize the page"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleCreatePage(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // update_page — Update an existing wiki page
  server.registerTool("update_page", {
    description: "Update an existing yopedia wiki page with new markdown content",
    inputSchema: {
      slug: z.string().describe("Slug of the page to update"),
      content: z.string().describe("New markdown body for the page"),
      author: z.string().optional().describe("Author handle for attribution"),
      owner: z.string().optional().describe("Owner handle — set on pages that don't already have an owner. Existing ownership is preserved."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleUpdatePage(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // update_metadata — Update page frontmatter without changing body
  server.registerTool("update_metadata", {
    description:
      "Update a wiki page's frontmatter metadata (confidence, disputed, tags, aliases, expiry, valid_from, supersedes) without modifying the page body. Lifecycle-managed fields (created, authors, sources) are rejected.",
    inputSchema: {
      slug: z.string().describe("Slug of the page to update"),
      metadata: z
        .record(z.string(), z.unknown())
        .describe(
          "Object of metadata fields to update. Allowed: confidence, disputed, tags, aliases, expiry, valid_from, supersedes. Unknown keys are ignored.",
        ),
      author: z
        .string()
        .optional()
        .describe("Author handle for contributor attribution"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleUpdateMetadata(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // delete_page — Delete a wiki page
  server.registerTool("delete_page", {
    description: "Delete a yopedia wiki page by slug",
    inputSchema: {
      slug: z.string().describe("Slug of the page to delete (e.g. 'neural-networks')"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleDeletePage(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // ingest_url — Ingest a URL into the wiki
  server.registerTool("ingest_url", {
    description:
      "Ingest a URL into the wiki — fetches the page, chunks the content, summarizes with an LLM, and creates/updates a wiki page with cross-references",
    inputSchema: {
      url: z.string().describe("URL to ingest (must start with http:// or https://)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to apply to the created page"),
      owner: z.string().optional().describe("Owner handle — the accountable principal for the resulting page. Sets frontmatter owner for tenant model."),
      triggeredBy: z.string().optional().describe("Handle of the user or agent that triggered this ingest (for provenance tracking)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    try {
      const result = await handleIngestUrl(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // batch_ingest_urls — Batch ingest multiple URLs into the wiki
  server.registerTool("batch_ingest_urls", {
    description:
      "Batch ingest multiple URLs into the wiki — validates all URLs upfront (rejects the batch if any are malformed), then ingests each sequentially. Returns per-URL results with slugs for successes and errors for failures. Use this instead of calling ingest_url N times for multi-source workflows.",
    inputSchema: {
      urls: z
        .array(z.string())
        .describe("Array of URLs to ingest (each must start with http:// or https://)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to apply to all created pages"),
      owner: z.string().optional().describe("Owner handle — the accountable principal for all resulting pages. Sets frontmatter owner for tenant model."),
      triggeredBy: z.string().optional().describe("Handle of the user or agent that triggered this batch ingest (for provenance tracking)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    try {
      const result = await handleBatchIngest(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // ingest_text — Ingest raw text content into the wiki
  server.registerTool("ingest_text", {
    description:
      "Ingest raw text content into the wiki — chunks the content, summarizes with an LLM, and creates/updates a wiki page with cross-references. Use this to contribute knowledge from documents, conversations, memory, or synthesized content without needing a URL.",
    inputSchema: {
      content: z.string().describe("The text content to ingest into the wiki"),
      title: z
        .string()
        .optional()
        .describe("Optional title for the wiki page (auto-generated from content if omitted)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to apply to the created page"),
      owner: z.string().optional().describe("Owner handle — the accountable principal for the resulting page. Sets frontmatter owner for tenant model."),
      triggeredBy: z.string().optional().describe("Handle of the user or agent that triggered this ingest (for provenance tracking)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleIngestText(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // ingest_x_mention — Ingest an X/Twitter post into the wiki with mention provenance
  server.registerTool("ingest_x_mention", {
    description:
      "Ingest an X (Twitter) post into the wiki — fetches the post content, processes it, and creates/updates a wiki page with x-mention provenance tracking. Use this when responding to @mentions or ingesting social media content.",
    inputSchema: {
      url: z.string().describe("X/Twitter URL to ingest (must be an x.com or twitter.com URL)"),
      triggered_by: z.string().describe("Handle of the user who triggered the mention (e.g. '@username')"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    try {
      const result = await handleIngestXMention(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // ingest_pdf — Ingest a PDF document into the wiki by URL
  server.registerTool("ingest_pdf", {
    description:
      "Ingest a PDF document into the wiki by URL — downloads the PDF, extracts text, chunks the content, summarizes with an LLM, and creates/updates a wiki page with cross-references. Supports text-based PDFs up to 20 MB.",
    inputSchema: {
      pdf_url: z
        .string()
        .describe("URL of the PDF to ingest (must start with http:// or https://)"),
      title: z
        .string()
        .optional()
        .describe("Optional title for the wiki page (auto-derived from PDF content if omitted)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to apply to the created page"),
      owner: z.string().optional().describe("Owner handle — the accountable principal for the resulting page. Sets frontmatter owner for tenant model."),
      triggeredBy: z.string().optional().describe("Handle of the user or agent that triggered this ingest (for provenance tracking)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    try {
      const result = await handleIngestPdf(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // query_wiki — Ask the wiki a question with LLM synthesis
  server.registerTool("query_wiki", {
    description:
      "Ask the wiki a question — searches relevant pages, synthesizes an answer with citations using an LLM",
    inputSchema: {
      question: z.string().describe("The question to ask the wiki"),
      format: z
        .enum(["prose", "table", "slides"])
        .optional()
        .describe("Answer format: prose (default), table, or slides"),
      scope: z
        .string()
        .optional()
        .describe("Scope query to an agent's pages, e.g. 'agent:yoyo'"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleQueryWiki(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // save_query_answer — Save a query answer as a wiki page
  server.registerTool("save_query_answer", {
    description:
      "Save a query answer as a durable wiki page with proper frontmatter — use after query_wiki to persist synthesized knowledge",
    inputSchema: {
      question: z
        .string()
        .describe("The original query question (used as the page title)"),
      answer: z
        .string()
        .describe("The LLM-synthesized answer to save as page content"),
      slug: z
        .string()
        .optional()
        .describe("Explicit page slug (derived from question if omitted)"),
      sources: z
        .array(z.string())
        .optional()
        .describe("Slugs of wiki pages cited in the answer"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleSaveQueryAnswer(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // agent_context — Get an agent's full context
  server.registerTool("agent_context", {
    description:
      "Get an agent's full context (identity, learnings, social wisdom) by agent ID",
    inputSchema: {
      agent_id: z.string().describe("Agent ID (e.g. 'yoyo')"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleAgentContext(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // seed_agent — Register an agent and create its wiki pages
  server.registerTool("seed_agent", {
    description:
      "Register an agent and create its wiki pages (identity, learnings, social wisdom). Idempotent — re-seeding updates existing pages.",
    inputSchema: {
      agent_id: z.string().describe("Agent ID (lowercase alphanumeric + hyphens)"),
      name: z.string().describe("Agent display name"),
      description: z.string().describe("Short description of the agent"),
      owner: z.string().optional().describe("Owner handle — the accountable principal claiming ownership of this agent. Ignored on re-seed if the agent already has an owner."),
      sections: z.array(z.object({
        slug: z.string().describe("Wiki page slug for this section"),
        title: z.string().describe("Page title"),
        type: z.enum(["identity", "learnings", "social"]).describe("Section type"),
        content: z.string().describe("Markdown content for this section"),
      })).describe("Content sections to create as wiki pages"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleSeedAgent(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // list_agents — List all registered agents
  server.registerTool("list_agents", {
    description:
      "List all registered agents with their IDs, names, and descriptions",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
    try {
      const result = await handleListAgents();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // update_agent — Update an existing agent profile
  server.registerTool("update_agent", {
    description:
      "Update an existing agent profile — modify name, description, add or remove pages",
    inputSchema: {
      agent_id: z.string().describe("Agent ID (e.g. 'yoyo')"),
      name: z.string().optional().describe("New display name"),
      description: z.string().optional().describe("New description"),
      addPages: z.array(z.object({
        slug: z.string().describe("Wiki page slug for this section"),
        title: z.string().describe("Page title"),
        type: z.enum(["identity", "learnings", "social"]).describe("Section type"),
        content: z.string().describe("Markdown content for this section"),
      })).optional().describe("Pages to create and add to the agent profile"),
      removePages: z.array(z.string()).optional().describe("Page slugs to remove from the agent profile (does not delete wiki pages)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleUpdateAgent(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // delete_agent — Delete an agent profile
  server.registerTool("delete_agent", {
    description:
      "Delete an agent profile by ID. Does not delete the agent's wiki pages.",
    inputSchema: {
      agent_id: z.string().describe("Agent ID to delete (e.g. 'yoyo')"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleDeleteAgent(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // lint_wiki — Run quality checks on the wiki
  server.registerTool("lint_wiki", {
    description:
      "Run quality checks on the yopedia wiki. Returns an array of issues with type, severity, slug, and message. Optionally scope to specific check types or minimum severity.",
    inputSchema: {
      checks: z
        .array(z.enum(ALL_CHECK_TYPES))
        .optional()
        .describe(
          `Check types to run (default: all). Valid: ${ALL_CHECK_TYPES.join(", ")}`,
        ),
      minSeverity: z
        .enum(["error", "warning", "info"])
        .optional()
        .describe("Minimum severity to include (default: info)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleLintWiki(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // fix_lint_issue — Auto-fix a lint issue
  server.registerTool("fix_lint_issue", {
    description:
      "Auto-fix a lint issue found by lint_wiki. Takes the issue type, slug, and optional target/message. Not all issue types are auto-fixable.",
    inputSchema: {
      type: z.enum(ALL_CHECK_TYPES).describe("Lint issue type (e.g. 'orphan-page', 'stale-index', 'empty-page')"),
      slug: z.string().describe("Slug of the affected page"),
      target: z
        .string()
        .optional()
        .describe("Target slug for cross-ref, contradiction, broken-link, and duplicate-entity fixes"),
      message: z
        .string()
        .optional()
        .describe("Message context for contradiction or missing-concept-page fixes"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleFixLintIssue(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // list_discussions — List discussion threads for a wiki page
  server.registerTool("list_discussions", {
    description:
      "List all discussion threads for a wiki page, including status, author, and comment count",
    inputSchema: {
      pageSlug: z
        .string()
        .describe("Slug of the wiki page to list discussions for"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleListDiscussions(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // create_discussion — Start a new discussion thread on a wiki page
  server.registerTool("create_discussion", {
    description:
      "Create a new discussion thread on a wiki page for editorial discussion",
    inputSchema: {
      pageSlug: z
        .string()
        .describe("Slug of the wiki page to discuss"),
      title: z.string().describe("Title of the discussion thread"),
      body: z
        .string()
        .describe("Body of the first comment (markdown supported)"),
      author: z
        .string()
        .describe("Author handle (agent ID or user handle)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleCreateDiscussion(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // resolve_discussion — Resolve a discussion thread
  server.registerTool("resolve_discussion", {
    description:
      "Resolve a discussion thread on a wiki page (mark as resolved or wontfix)",
    inputSchema: {
      pageSlug: z
        .string()
        .describe("Slug of the wiki page the discussion belongs to"),
      threadIndex: z
        .number()
        .describe("Zero-based index of the thread to resolve"),
      resolution: z
        .enum(["open", "resolved", "wontfix"])
        .describe('Resolution status: "open" (reopen), "resolved", or "wontfix"'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleResolveDiscussion(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // add_comment — Add a comment to a discussion thread
  server.registerTool("add_comment", {
    description:
      "Add a comment to an existing discussion thread on a wiki page",
    inputSchema: {
      pageSlug: z
        .string()
        .describe("Slug of the wiki page the discussion belongs to"),
      threadIndex: z
        .number()
        .describe("Zero-based index of the thread to comment on"),
      content: z
        .string()
        .describe("Comment body (markdown supported)"),
      author: z
        .string()
        .optional()
        .describe('Author handle (agent ID or user handle, defaults to "anonymous")'),
      parentId: z
        .string()
        .optional()
        .describe("ID of parent comment for threaded replies (omit for top-level)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleAddComment(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // reingest — Re-ingest a wiki page from its original source URL
  server.registerTool("reingest", {
    description:
      "Re-ingest a wiki page from its original source URL to refresh stale content",
    inputSchema: {
      slug: z
        .string()
        .describe("Slug of the wiki page to re-ingest"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleReingest(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // ingest_history — View ingest ledger entries for provenance auditing
  server.registerTool("ingest_history", {
    description:
      "View ingest ledger entries for provenance auditing. " +
      "Returns structured JSON array of past ingest operations, most recent first. " +
      "Each entry includes ingest_id, source_type, source_url, primary_slug, related_slugs, timestamps, and status.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of entries to return (default: 50)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleIngestHistory(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // dataview_query — Query wiki pages by frontmatter fields
  server.registerTool("dataview_query", {
    description:
      "Query yopedia wiki pages by frontmatter fields with structured filters, sort, and limit. " +
      "Supports operators: eq, neq, gt, lt, gte, lte, contains, exists.",
    inputSchema: {
      filters: z
        .array(
          z.object({
            field: z.string().describe("Frontmatter field name (e.g. 'confidence', 'tags', 'created')"),
            op: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains", "exists"]).describe("Comparison operator"),
            value: z.string().optional().describe("Comparison value (not needed for 'exists' op)"),
          }),
        )
        .optional()
        .describe("Array of filter predicates (AND semantics — all must match)"),
      sortBy: z
        .string()
        .optional()
        .describe("Frontmatter field to sort results by"),
      sortOrder: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort direction (default: asc)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results (default 50, max 200)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleDataviewQuery(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // list_revisions — List revision history for a page
  server.registerTool("list_revisions", {
    description:
      "List revision history for a yopedia wiki page. Returns metadata for each revision " +
      "(timestamp, date, author, reason, sizeBytes) sorted newest first.",
    inputSchema: {
      slug: z
        .string()
        .describe("Slug of the wiki page to list revisions for"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleListRevisions(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // read_revision — Read a specific revision's content
  server.registerTool("read_revision", {
    description:
      "Read the full content of a specific revision of a yopedia wiki page. " +
      "Use list_revisions first to discover available timestamps.",
    inputSchema: {
      slug: z
        .string()
        .describe("Slug of the wiki page"),
      timestamp: z
        .number()
        .describe("Unix timestamp in milliseconds identifying the revision"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleReadRevision(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // list_contributors — List all contributors with trust scores
  server.registerTool("list_contributors", {
    description:
      "List all contributors who have edited wiki pages or participated in discussions. " +
      "Returns trust scores, edit counts, revert rates, and activity dates for each contributor.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
    try {
      const result = await handleListContributors();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // get_contributor — Get a single contributor's profile
  server.registerTool("get_contributor", {
    description:
      "Get the trust profile for a specific contributor by handle. " +
      "Returns edit count, pages edited, comment count, revert rate, trust score, and activity dates.",
    inputSchema: {
      handle: z.string().describe("Contributor handle to look up"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleGetContributor(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // vault_curate — Add a commons page to a user's vault
  server.registerTool("vault_curate", {
    description:
      "Curate a public commons page into one of a user's named vaults. A vault is a personal " +
      "reference lens over the commons — no copy is made; the page itself stays collective. The " +
      "named vault is created (public) on first use. Only public, non-agent (commons) pages can " +
      "be curated.",
    inputSchema: {
      slug: z.string().describe("Slug of the commons page to curate"),
      owner: z
        .string()
        .describe("Handle of the vault owner (must match the MCP caller's identity)"),
      vault: z
        .string()
        .describe("Name of the vault to curate into / remove from"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleVaultCurate(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  // vault_uncurate — Remove a commons page from a user's vault
  server.registerTool("vault_uncurate", {
    description:
      "Remove a curated commons page reference from one of a user's named vaults. This only drops " +
      "the reference — the commons page itself is unaffected. No-op if the page was not curated.",
    inputSchema: {
      slug: z.string().describe("Slug of the page to uncurate"),
      owner: z
        .string()
        .describe("Handle of the vault owner (must match the MCP caller's identity)"),
      vault: z
        .string()
        .describe("Name of the vault to curate into / remove from"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    try {
      const result = await handleVaultUncurate(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: (err as Error).message,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Main — run as stdio server when executed directly
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("yopedia MCP server running on stdio");
}

// Only run main when executed directly (not imported for testing)
const isDirectExecution =
  process.argv[1]?.endsWith("mcp.ts") ||
  process.argv[1]?.endsWith("mcp.js");

if (isDirectExecution) {
  main().catch((error) => {
    console.error("MCP server error:", error);
    process.exit(1);
  });
}
