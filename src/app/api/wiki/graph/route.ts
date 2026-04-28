import { NextResponse } from "next/server";
import { listWikiPages, readWikiPageWithFrontmatter } from "@/lib/wiki";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface GraphNode {
  id: string;
  label: string;
  linkCount: number;
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function GET() {
  try {
    const pages = await listWikiPages();
    const slugSet = new Set(pages.map((p) => p.slug));

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // First pass: build nodes (with tags) and collect edges
    for (const page of pages) {
      const wp = await readWikiPageWithFrontmatter(page.slug);
      const rawTags = wp?.frontmatter?.tags;
      const tags: string[] = Array.isArray(rawTags)
        ? rawTags.map(String)
        : typeof rawTags === "string"
          ? [rawTags]
          : [];

      nodes.push({
        id: page.slug,
        label: wp?.title ?? page.title,
        linkCount: 0, // computed below
        tags,
      });

      if (!wp) continue;

      const linkRe = /\[([^\]]*)\]\(([^)]+)\.md\)/g;
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(wp.body)) !== null) {
        const target = match[2];
        if (target !== page.slug && slugSet.has(target)) {
          edges.push({ source: page.slug, target });
        }
      }
    }

    // Second pass: compute linkCount (inbound + outbound) per node
    const countMap = new Map<string, number>();
    for (const edge of edges) {
      countMap.set(edge.source, (countMap.get(edge.source) ?? 0) + 1);
      countMap.set(edge.target, (countMap.get(edge.target) ?? 0) + 1);
    }
    for (const node of nodes) {
      node.linkCount = countMap.get(node.id) ?? 0;
    }

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    logger.error("wiki", "Graph API error", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
