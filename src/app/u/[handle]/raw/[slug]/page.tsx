import { decodeSlug } from "@/lib/slugify";
import { notFound, permanentRedirect } from "next/navigation";
import {
  readRawSource,
  readRawSourceById,
  readWikiPageWithFrontmatter,
  tenantForOwner,
} from "@/lib/wiki";
import { parseSources } from "@/lib/sources";
import { pagePath, rawPath } from "@/lib/links";
import { canReadSlug } from "@/lib/authz";
import { getPrincipal } from "@/lib/auth";
import { RawSourceBrowser, type RawItem } from "@/components/RawSourceBrowser";

interface RawSourcePageProps {
  params: Promise<{ handle: string; slug: string }>;
}

export default async function RawSourcePage({ params }: RawSourcePageProps) {
  const { handle: encodedHandle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);

  // A private page's raw source is owner-only — 404 (same as missing) otherwise.
  if (!(await canReadSlug(slug, await getPrincipal()))) {
    notFound();
  }

  // The owner segment is canonical: resolve it from the page's frontmatter so
  // the "Back to page" link is correct regardless of the URL's handle.
  const ownerPage = await readWikiPageWithFrontmatter(slug);
  const pageTenant = tenantForOwner(
    typeof ownerPage?.frontmatter.owner === "string"
      ? ownerPage.frontmatter.owner
      : undefined,
  );
  if (decodeSlug(encodedHandle).toLowerCase() !== pageTenant) {
    permanentRedirect(rawPath(pageTenant, slug));
  }

  // Build the source list from the page's provenance. Newest first.
  const sources = parseSources(
    ownerPage?.frontmatter.sources as string | string[] | undefined,
  )
    .slice()
    .reverse();
  const anyRaw = sources.some((s) => s.raw_id);

  let items: RawItem[];
  let initialKey: string;
  let initialContent: string | null = null;

  if (anyRaw) {
    // Per-source pages: one entry per source. Snapshots are viewable; sources
    // ingested before per-source raw existed are shown as "uncaptured".
    items = sources.map((s, i) => ({
      key: s.raw_id ?? `uncaptured-${i}`,
      kind: s.raw_id ? "snapshot" : "uncaptured",
      sourceId: s.raw_id ?? null,
      type: s.type,
      url: s.url,
      fetched: s.fetched,
      triggeredBy: s.triggered_by,
    }));
    const firstSnapshot = items.find((it) => it.kind === "snapshot")!;
    initialKey = firstSnapshot.key;
    try {
      initialContent = (await readRawSourceById(slug, firstSnapshot.sourceId!))
        .content;
    } catch {
      initialContent = null;
    }
  } else {
    // Legacy page: a single latest blob, regardless of how many sources exist.
    let blob;
    try {
      blob = await readRawSource(slug);
    } catch {
      notFound();
    }
    const latest = sources[0];
    items = [
      {
        key: "__legacy__",
        kind: "legacy",
        sourceId: null,
        type: latest?.type ?? "url",
        url: latest?.url ?? "text-paste",
        fetched: latest?.fetched ?? blob.modified.slice(0, 10),
        triggeredBy: latest?.triggered_by ?? "system",
      },
    ];
    initialKey = "__legacy__";
    initialContent = blob.content;
  }

  return (
    <RawSourceBrowser
      slug={slug}
      items={items}
      initialKey={initialKey}
      initialContent={initialContent}
      backHref={pagePath(pageTenant, slug)}
    />
  );
}
