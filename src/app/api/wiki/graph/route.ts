import { NextResponse } from "next/server";
import { listWikiPages, readWikiPage } from "@/lib/wiki";

interface GraphNode {
  id: string;
  label: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function GET() {
  try {
    const pages = await listWikiPages();
    const slugSet = new Set(pages.map((p) => p.slug));

    const nodes: GraphNode[] = pages.map((p) => ({
      id: p.slug,
      label: p.title,
    }));

    const edges: GraphEdge[] = [];
    const linkRe = /\[([^\]]*)\]\(([^)]+)\.md\)/g;

    for (const page of pages) {
      const wp = await readWikiPage(page.slug);
      if (!wp) continue;

      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(wp.content)) !== null) {
        const target = match[2];
        if (target !== page.slug && slugSet.has(target)) {
          edges.push({ source: page.slug, target });
        }
      }
    }

    return NextResponse.json({ nodes, edges });
  } catch (error) {
    console.error("Graph API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
