import { NextResponse } from "next/server";
import { readWikiPage, readWikiPageWithFrontmatter, writeWikiPageWithSideEffects } from "@/lib/wiki";
import { listRevisions, readRevision, getRevisionsDir } from "@/lib/revisions";
import { extractSummary } from "@/lib/ingest";
import { serializeFrontmatter } from "@/lib/frontmatter";
import { getErrorMessage } from "@/lib/errors";
import fs from "fs/promises";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/wiki/[slug]/revisions
 *
 * Without query params: returns `{ revisions: Revision[] }`.
 * With `?timestamp=<ms>`: returns `{ content: string, revision: Revision }` for
 * a specific revision.
 *
 * 404 if the page doesn't exist.
 * 200 with empty array if the page exists but has no revisions.
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;

    // Check the page exists first.
    const page = await readWikiPage(slug);
    if (!page) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    const url = new URL(req.url);
    const timestampParam = url.searchParams.get("timestamp");

    if (timestampParam !== null) {
      // Fetch a specific revision's content.
      const timestamp = Number(timestampParam);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return NextResponse.json(
          { error: "timestamp must be a positive number" },
          { status: 400 },
        );
      }

      const content = await readRevision(slug, timestamp);
      if (content === null) {
        return NextResponse.json(
          { error: `revision not found: ${timestamp}` },
          { status: 404 },
        );
      }

      // Read optional author sidecar.
      let author: string | undefined;
      try {
        const metaPath = `${getRevisionsDir(slug)}/${timestamp}.meta.json`;
        const metaRaw = await fs.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaRaw) as { author?: string };
        if (typeof meta.author === "string") {
          author = meta.author;
        }
      } catch {
        // No sidecar → no author attribution.
      }

      return NextResponse.json({
        content,
        revision: {
          timestamp,
          date: new Date(timestamp).toISOString(),
          slug,
          sizeBytes: Buffer.byteLength(content, "utf-8"),
          ...(author !== undefined && { author }),
        },
      });
    }

    // List all revisions.
    const revisions = await listRevisions(slug);
    return NextResponse.json({ revisions });
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/wiki/[slug]/revisions
 *
 * Body: `{ action: "revert", timestamp: number }`
 *
 * Reverts the page to the content from the given revision. Uses
 * `writeWikiPageWithSideEffects` so index, cross-refs, and log stay consistent.
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { slug } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("action" in body) ||
      (body as { action: unknown }).action !== "revert"
    ) {
      return NextResponse.json(
        { error: 'action must be "revert"' },
        { status: 400 },
      );
    }

    const timestamp = (body as { timestamp?: unknown }).timestamp;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
      return NextResponse.json(
        { error: "timestamp must be a positive number" },
        { status: 400 },
      );
    }

    // Ensure the page exists.
    const existing = await readWikiPageWithFrontmatter(slug);
    if (!existing) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    // Load the revision content.
    const revisionContent = await readRevision(slug, timestamp);
    if (revisionContent === null) {
      return NextResponse.json(
        { error: `revision not found: ${timestamp}` },
        { status: 404 },
      );
    }

    // Derive title from the revision content's first H1, falling back to
    // the existing page title.
    const titleMatch = revisionContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : existing.title;

    // Strip the leading H1 before deriving the summary.
    const bodyForSummary = revisionContent.replace(/^#\s+.+$/m, "").trim();
    const summary = extractSummary(bodyForSummary);

    // Merge frontmatter: use the existing page's frontmatter but bump the
    // `updated` date to today so the timeline reflects the revert.
    const today = new Date().toISOString().slice(0, 10);
    const mergedFrontmatter = { ...existing.frontmatter };
    if (
      typeof mergedFrontmatter.created !== "string" ||
      mergedFrontmatter.created === ""
    ) {
      mergedFrontmatter.created = today;
    }
    mergedFrontmatter.updated = today;

    // If the revision content already has its own frontmatter block we use
    // it as-is (the old snapshot is the full page including YAML). Otherwise
    // we prepend the merged frontmatter.
    const hasYamlBlock = revisionContent.trimStart().startsWith("---");
    const finalContent = hasYamlBlock
      ? revisionContent
      : serializeFrontmatter(mergedFrontmatter, revisionContent);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content: finalContent,
      summary,
      logOp: "edit",
      crossRefSource: revisionContent,
      logDetails: (ctx) =>
        `reverted to revision ${new Date(timestamp).toISOString()} · updated ${ctx.updatedSlugs.length} cross-ref(s)`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
