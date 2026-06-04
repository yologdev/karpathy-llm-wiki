import { NextResponse, type NextRequest } from "next/server";
import {
  readWikiPageWithFrontmatter,
  listReadableWikiPages,
  isAgentScopedType,
} from "@/lib/wiki";
import { ownerToTenant } from "@/lib/links";
import { listCommonsPages } from "@/lib/commons";
import { expandMineScope, resolveScope } from "@/lib/search";
import { getPrincipal } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface GraphNode {
  id: string;
  label: string;
  /** Canonical tenant for the node, so clicks navigate to `/u/<tenant>/<slug>`. */
  tenant: string;
  linkCount: number;
  tags: string[];
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function GET(req: NextRequest) {
  try {
    // Unscoped → the public commons graph. Scoped (`?scope=mine|owner:<h>`) →
    // that silo's readable pages (incl. the viewer's own private pages). Unlike
    // query, an empty "mine" shows an empty graph (your silo), not the commons.
    const scopeParam =
      new URL(req.url).searchParams.get("scope") || undefined;
    const principal = await getPrincipal();
    const expanded = expandMineScope(scopeParam, principal);

    let pages;
    if (expanded) {
      const resolved = await resolveScope(expanded);
      const scopeSet = new Set(resolved?.slugs ?? []);
      pages = (await listReadableWikiPages(principal)).filter(
        (p) => scopeSet.has(p.slug) && !isAgentScopedType(p.type),
      );
    } else {
      pages = await listCommonsPages();
    }
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
        tenant: ownerToTenant(page.owner),
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
