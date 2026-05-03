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
 *   agent_context  — Get an agent's full context by agent ID
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
  listWikiPages,
  validateSlug,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  type Frontmatter,
} from "./lib/wiki";
import { extractSummary } from "./lib/ingest";
import { getAgent } from "./lib/agents";
import type { ContentSearchResult } from "./lib/search";

// ---------------------------------------------------------------------------
// Tool handler logic — exported for direct testing without transport
// ---------------------------------------------------------------------------

export async function handleSearchWiki(args: {
  query: string;
  limit?: number | undefined;
}): Promise<{ slug: string; title: string; snippet: string; score: number }[]> {
  const limit = args.limit ?? 10;
  const results: ContentSearchResult[] = await searchWikiContent(
    args.query,
    limit,
  );
  // searchWikiContent returns objects with score (not in the interface but present)
  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    snippet: r.snippet,
    score: (r as unknown as { score: number }).score ?? 0,
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
  const entries = await listWikiPages();

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
      // Parse confidence from frontmatter; entries don't have confidence directly
      // so fall back to 0 for sorting purposes
      const aC = (a as unknown as { confidence?: number }).confidence ?? 0;
      const bC = (b as unknown as { confidence?: number }).confidence ?? 0;
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
}): Promise<{ slug: string; title: string; created: true }> {
  validateSlug(args.slug);

  // Check for conflicts
  const existing = await readWikiPage(args.slug);
  if (existing) {
    throw new Error(`Page already exists: ${args.slug}`);
  }

  const title = extractTitle(args.content, args.slug);
  const summary = extractSummary(args.content);
  const today = new Date().toISOString().slice(0, 10);

  const frontmatter: Frontmatter = {
    title,
    created: today,
    updated: today,
  };

  const fullContent = serializeFrontmatter(frontmatter, args.content);

  await writeWikiPageWithSideEffects({
    slug: args.slug,
    title,
    content: fullContent,
    summary,
    logOp: "ingest",
    crossRefSource: null, // skip cross-ref for MCP writes
  });

  return { slug: args.slug, title, created: true };
}

export async function handleUpdatePage(args: {
  slug: string;
  content: string;
  author?: string;
}): Promise<{ slug: string; title: string; updated: true }> {
  const existingPage = await readWikiPageWithFrontmatter(args.slug);
  if (!existingPage) {
    throw new Error(`Page not found: ${args.slug}`);
  }

  const title = extractTitle(args.content, existingPage.title);
  const summary = extractSummary(args.content);
  const today = new Date().toISOString().slice(0, 10);

  // Merge frontmatter: preserve existing fields, bump updated, backfill created
  const merged: Frontmatter = {
    ...existingPage.frontmatter,
    title,
    updated: today,
  };
  if (!merged.created) {
    merged.created = today;
  }

  const fullContent = serializeFrontmatter(merged, args.content);

  await writeWikiPageWithSideEffects({
    slug: args.slug,
    title,
    content: fullContent,
    summary,
    logOp: "edit",
    author: args.author,
    crossRefSource: null, // skip cross-ref for MCP writes
  });

  return { slug: args.slug, title, updated: true };
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
    const page = await readWikiPage(slug);
    if (page) {
      contents.push(page.content);
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
  agent: { id: string; name: string; description: string };
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

  const [identity, learnings, social] = await Promise.all([
    loadPages(agent.identityPages),
    loadPages(agent.learningPages),
    loadPages(agent.socialPages),
  ]);

  const totalChars =
    identity.content.length + learnings.content.length + social.content.length;
  const pageCount = identity.count + learnings.count + social.count;

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
    },
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
// MCP server setup
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "yopedia",
    version: "1.0.0",
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
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    const results = await handleSearchWiki(args);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  });

  // read_page — Read a single wiki page
  server.registerTool("read_page", {
    description: "Read a single yopedia wiki page by slug",
    inputSchema: {
      slug: z.string().describe("Page slug (e.g. 'neural-networks')"),
    },
    annotations: {
      readOnlyHint: true,
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
      openWorldHint: false,
    },
  }, async (args) => {
    const pages = await handleListPages(args);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(pages, null, 2),
        },
      ],
    };
  });

  // create_page — Create a new wiki page
  server.registerTool("create_page", {
    description: "Create a new yopedia wiki page with the given slug and markdown content",
    inputSchema: {
      slug: z.string().describe("URL-safe page slug (e.g. 'neural-networks')"),
      content: z.string().describe("Markdown body for the new page (include a # Heading for the title)"),
    },
    annotations: {
      readOnlyHint: false,
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
    },
    annotations: {
      readOnlyHint: false,
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

  // agent_context — Get an agent's full context
  server.registerTool("agent_context", {
    description:
      "Get an agent's full context (identity, learnings, social wisdom) by agent ID",
    inputSchema: {
      agent_id: z.string().describe("Agent ID (e.g. 'yoyo')"),
    },
    annotations: {
      readOnlyHint: true,
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
