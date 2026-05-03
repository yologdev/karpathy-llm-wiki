#!/usr/bin/env node
/**
 * yopedia MCP server — exposes read-only wiki tools over stdio transport.
 *
 * Tools:
 *   search_wiki  — Search wiki pages by query string
 *   read_page    — Read a single wiki page by slug
 *   list_pages   — List all wiki pages with optional sort/limit
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
  readWikiPageWithFrontmatter,
  listWikiPages,
} from "./lib/wiki";
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
