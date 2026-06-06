import { listReadableWikiPages } from "@/lib/wiki";
import { listCommonsPages } from "@/lib/commons";
import type { IndexEntry } from "@/lib/types";
import { getVault } from "@/lib/vault";
import { listVaults } from "@/lib/vault";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { BrowseClient } from "@/components/BrowseClient";

export default async function WikiIndex({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tag?: string }>;
}) {
  const { scope: scopeParam } = await searchParams;
  const principal = await getPrincipal();
  const myHandle = principal?.handle ?? null;

  // Default scope = the public commons ("Public") for everyone — a soft VIEW
  // filter over public content, not access control. A `vault:<id>` scope is a
  // curated reference lens (public vaults only resolve via scope).
  const effectiveScope = scopeParam ?? "all";
  const vaultId = effectiveScope.startsWith("vault:")
    ? effectiveScope.slice("vault:".length)
    : null;

  // The signed-in user's own vaults drive the lens pills (and the per-row Remove
  // when viewing one of their own vaults).
  const myVaults = myHandle ? await listVaults(myHandle) : [];

  let pages: IndexEntry[];
  if (vaultId) {
    // Vault lens: a public vault's referenced commons pages, intersected with
    // what the viewer may read. Private vaults never resolve via scope.
    const vault = await getVault(vaultId);
    if (!vault || vault.visibility !== "public") {
      pages = [];
    } else {
      const refs = new Set(vault.slugs);
      pages = (await listReadableWikiPages(principal)).filter((p) =>
        refs.has(p.slug),
      );
    }
  } else {
    // "Public" scope = the public commons (read from the commons index).
    pages = await listCommonsPages();
  }

  const slugs = pages.map((p) => p.slug);
  const statsMap = await getDiscussionStatsForSlugs(slugs);
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return (
    <BrowseClient
      pages={pages}
      myHandle={myHandle}
      activeScope={effectiveScope}
      myVaults={myVaults.map((v) => ({
        id: v.id,
        name: v.name,
        visibility: v.visibility,
      }))}
      discussionStats={discussionStats}
    />
  );
}
