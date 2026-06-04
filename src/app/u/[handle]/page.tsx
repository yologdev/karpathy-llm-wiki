import Link from "next/link";
import { listReadableWikiPages } from "@/lib/wiki";
import { slugsForOwner } from "@/lib/search";
import { listAgentsForOwner, agentShortName } from "@/lib/agents";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { getPrincipal } from "@/lib/auth";
import { decodeSlug } from "@/lib/slugify";
import { WikiIndexClient } from "@/components/WikiIndexClient";

// Public profile: pages a given handle owns or has contributed to. Visible to
// anyone (guests included) — yopedia is a public observer surface.
export default async function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: encoded } = await params;
  const handle = decodeSlug(encoded);

  const mine = new Set(await slugsForOwner(handle));
  const readable = await listReadableWikiPages(await getPrincipal());
  const pages = readable.filter((p) => mine.has(p.slug));
  const agents = await listAgentsForOwner(handle);

  const statsMap = await getDiscussionStatsForSlugs(pages.map((p) => p.slug));
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <Link href="/wiki?scope=all" className="text-sm text-foreground/50 hover:text-foreground">
          ← All content
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">@{handle}</h1>
        <p className="mt-1 text-foreground/60">
          Public pages owned or contributed by {handle}.
        </p>

        {/* Silo actions — query/graph scoped to this handle's pages. */}
        {pages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/query?scope=owner:${encodeURIComponent(handle)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-1.5 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              💬 Ask these pages
            </Link>
            <Link
              href={`/wiki/graph?scope=owner:${encodeURIComponent(handle)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-1.5 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              🕸 Graph this silo
            </Link>
            {/* Plain anchor — this is a file download, not a route. */}
            <a
              href={`/api/wiki/export?scope=owner:${encodeURIComponent(handle)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/10 px-3 py-1.5 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              ⬇ Download vault
            </a>
          </div>
        )}
      </div>

      {agents.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Agents
          </h2>
          <ul className="space-y-2">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Link
                  href={`/u/${handle}/a/${agentShortName(agent)}`}
                  className="group block rounded-lg border border-foreground/10 p-3 hover:border-foreground/30"
                >
                  <span className="font-medium group-hover:underline">
                    {agent.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-foreground/60">
                    {agent.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pages.length === 0 ? (
        <p className="text-foreground/60">No pages yet.</p>
      ) : (
        <WikiIndexClient pages={pages} discussionStats={discussionStats} />
      )}
    </main>
  );
}
