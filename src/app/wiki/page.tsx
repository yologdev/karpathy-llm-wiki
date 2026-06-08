import { listVaults } from "@/lib/vault";
import { getPrincipal } from "@/lib/auth";
import { searchCommons, BROWSE_PAGE_SIZE } from "@/lib/browse";
import { BrowseClient } from "@/components/BrowseClient";

export default async function WikiIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tag?: string | string[] }>;
}) {
  const { scope: scopeParam, tag: tagRaw } = await searchParams;
  // A repeated `?tag=a&tag=b` arrives as string[] at runtime despite the type —
  // take the first so the filter never compares against an array.
  const tagParam = Array.isArray(tagRaw) ? tagRaw[0] : tagRaw;
  const principal = await getPrincipal();
  const myHandle = principal?.handle ?? null;

  // Default scope = the public commons ("Public") for everyone — a soft VIEW
  // filter over public content, not access control. A `vault:<id>` scope is a
  // curated reference lens (public vaults only resolve via scope).
  const effectiveScope = scopeParam ?? "all";

  // The signed-in user's own vaults drive the lens pills (and the per-row Remove
  // when viewing one of their own vaults).
  const myVaults = myHandle ? await listVaults(myHandle) : [];

  // First page, server-rendered (no query) — the client takes over from here,
  // re-fetching `/api/wiki/browse` on every search / sort / tag / page change.
  const initial = await searchCommons(null, {
    scope: effectiveScope,
    tag: tagParam ?? null,
    sort: "recent",
    page: 1,
    pageSize: BROWSE_PAGE_SIZE,
    principal,
  });

  return (
    <BrowseClient
      myHandle={myHandle}
      activeScope={effectiveScope}
      myVaults={myVaults.map((v) => ({
        id: v.id,
        name: v.name,
        visibility: v.visibility,
      }))}
      initialResults={initial.results}
      initialTotal={initial.total}
      initialTags={initial.tags}
      initialDiscussionStats={initial.discussionStats}
      pageSize={BROWSE_PAGE_SIZE}
      initialTag={tagParam ?? null}
    />
  );
}
