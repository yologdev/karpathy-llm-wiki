import { NextResponse } from "next/server";
import {
  deleteWikiPage,
  readWikiPageWithFrontmatter,
  serializeFrontmatter,
  writeWikiPageWithSideEffects,
  type Frontmatter,
} from "@/lib/wiki";
import { extractSummary } from "@/lib/ingest";
import { getErrorMessage } from "@/lib/errors";

/** Frontmatter keys that PATCH is allowed to set. */
const PATCHABLE_KEYS = new Set([
  "confidence",
  "disputed",
  "tags",
  "aliases",
  "expiry",
  "valid_from",
  "supersedes",
]);

/** Lifecycle-managed keys that PATCH must reject. */
const LIFECYCLE_KEYS = new Set(["created", "authors", "sources"]);

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const result = await deleteWikiPage(slug);
    return NextResponse.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.startsWith("page not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/wiki/[slug]
 *
 * Replace the body of an existing wiki page. Returns 404 when the slug
 * doesn't exist — edit is strictly an update operation, use the ingest flow
 * (or a future create endpoint) to add new pages.
 *
 * Body: `{ content: string }` — the new markdown **body** (no YAML
 * frontmatter). The editor never exposes the YAML block to users; the
 * server owns frontmatter end-to-end.
 *
 * On save the route:
 *   1. Reads the existing page's parsed frontmatter.
 *   2. Bumps `updated` to today (YYYY-MM-DD), backfilling `created` for
 *      legacy pages that were written before frontmatter existed.
 *   3. Preserves every other key (`source_count`, `tags`, and any extras).
 *   4. Re-serializes `frontmatter + body` via {@link serializeFrontmatter}
 *      and writes through {@link writeWikiPageWithSideEffects} so the
 *      index, cross-references, and activity log all stay consistent.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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

    const newBody =
      body && typeof body === "object" && "content" in body
        ? (body as { content: unknown }).content
        : undefined;

    if (typeof newBody !== "string" || newBody.trim().length === 0) {
      return NextResponse.json(
        { error: "content must be a non-empty string" },
        { status: 400 },
      );
    }

    // Optional author attribution from the request body.
    const author =
      body && typeof body === "object" && "author" in body
        ? (body as { author: unknown }).author
        : undefined;
    const authorStr = typeof author === "string" && author.trim().length > 0
      ? author.trim()
      : undefined;

    const existing = await readWikiPageWithFrontmatter(slug);
    if (!existing) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    // Derive title from the new body's first H1, falling back to the old title.
    const titleMatch = newBody.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : existing.title;

    // Strip the leading H1 (if present) before deriving the summary so the
    // heading text doesn't end up as the summary line.
    const bodyForSummary = newBody.replace(/^#\s+.+$/m, "").trim();
    const summary = extractSummary(bodyForSummary);

    // Merge frontmatter: preserve everything the existing page had, then
    // bump `updated` (and backfill `created` for legacy pages that predate
    // frontmatter entirely). Also append the editor to `contributors` if not
    // already present.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const mergedFrontmatter: Frontmatter = { ...existing.frontmatter };
    if (
      typeof mergedFrontmatter.created !== "string" ||
      mergedFrontmatter.created === ""
    ) {
      mergedFrontmatter.created = today;
    }
    mergedFrontmatter.updated = today;

    // Track contributors: append the editor if they're not already listed.
    if (authorStr) {
      const existingContributors = Array.isArray(mergedFrontmatter.contributors)
        ? (mergedFrontmatter.contributors as string[])
        : [];
      if (!existingContributors.includes(authorStr)) {
        mergedFrontmatter.contributors = [...existingContributors, authorStr];
      }
    }

    const mergedContent = serializeFrontmatter(mergedFrontmatter, newBody);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title,
      content: mergedContent,
      summary,
      logOp: "edit",
      // Use the user-visible body as the cross-ref signal so the YAML
      // block doesn't bias related-page matching.
      crossRefSource: newBody,
      author: authorStr,
      logDetails: (ctx) =>
        `edited · updated ${ctx.updatedSlugs.length} cross-ref(s)`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/wiki/[slug]
 *
 * Update a wiki page's frontmatter metadata without replacing its body.
 * Accepts `{ metadata: Partial<Frontmatter>, author?: string }`.
 *
 * Allowed metadata keys: confidence, disputed, tags, aliases, expiry,
 * valid_from, supersedes. Lifecycle-managed keys (created, authors, sources)
 * are rejected with 400.
 *
 * On every successful PATCH the `updated` field is bumped to today. If an
 * `author` string is provided it is appended to `contributors` (deduplicated).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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

    if (!body || typeof body !== "object" || !("metadata" in body)) {
      return NextResponse.json(
        { error: "request body must contain a metadata object" },
        { status: 400 },
      );
    }

    const metadata = (body as { metadata: unknown }).metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return NextResponse.json(
        { error: "metadata must be a non-null object" },
        { status: 400 },
      );
    }

    // Reject lifecycle-managed keys.
    const incoming = metadata as Record<string, unknown>;
    const rejected = Object.keys(incoming).filter((k) => LIFECYCLE_KEYS.has(k));
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `cannot update lifecycle-managed fields via PATCH: ${rejected.join(", ")}` },
        { status: 400 },
      );
    }

    // Filter to only patchable keys (silently ignore unknown keys).
    const patch: Frontmatter = {};
    for (const key of Object.keys(incoming)) {
      if (PATCHABLE_KEYS.has(key)) {
        patch[key] = incoming[key] as Frontmatter[string];
      }
    }

    // Read the existing page.
    const existing = await readWikiPageWithFrontmatter(slug);
    if (!existing) {
      return NextResponse.json(
        { error: `page not found: ${slug}` },
        { status: 404 },
      );
    }

    // Merge: existing frontmatter + patch + bump updated.
    const today = new Date().toISOString().slice(0, 10);
    const mergedFrontmatter: Frontmatter = {
      ...existing.frontmatter,
      ...patch,
      updated: today,
    };

    // Append author to contributors (deduplicated).
    const author =
      body && typeof body === "object" && "author" in body
        ? (body as { author: unknown }).author
        : undefined;
    const authorStr =
      typeof author === "string" && author.trim().length > 0
        ? author.trim()
        : undefined;

    if (authorStr) {
      const existingContributors = Array.isArray(mergedFrontmatter.contributors)
        ? (mergedFrontmatter.contributors as string[])
        : [];
      if (!existingContributors.includes(authorStr)) {
        mergedFrontmatter.contributors = [...existingContributors, authorStr];
      }
    }

    // Re-serialize with the existing body (unchanged).
    const mergedContent = serializeFrontmatter(mergedFrontmatter, existing.body);

    const result = await writeWikiPageWithSideEffects({
      slug,
      title: existing.title,
      content: mergedContent,
      summary: extractSummary(existing.body.replace(/^#\s+.+$/m, "").trim()),
      logOp: "edit",
      crossRefSource: null,
      author: authorStr,
      logDetails: () => `metadata updated via PATCH`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = getErrorMessage(err);
    const status = message.toLowerCase().startsWith("invalid slug") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
