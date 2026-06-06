import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentByOwnerName, resolveAgentPages } from "@/lib/agents";
import { listReadableWikiPages, ownerToTenant } from "@/lib/wiki";
import { pagePath } from "@/lib/links";
import { getDiscussionStatsForSlugs } from "@/lib/talk";
import { decodeSlug } from "@/lib/slugify";
import { getErrorMessage } from "@/lib/errors";
import { getPrincipal } from "@/lib/auth";
import { WikiIndexClient } from "@/components/WikiIndexClient";
import { AgentTokenPanel } from "@/components/AgentTokenPanel";
import type { AgentProfile, IndexEntry } from "@/lib/types";

// Public agent profile, scoped under its owner's handle: /u/<handle>/a/<name>.
// Layout: a Knowledge list (the agent's own + inherited learnings, shown like a
// user's page list) and a separate Identity section (the base identity it's
// forked from). The owner additionally sees the credential panel. Reads are
// public.
export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ handle: string; agent: string }>;
}) {
  const { handle: encodedHandle, agent: encodedAgent } = await params;
  const handle = decodeSlug(encodedHandle);
  const name = decodeSlug(encodedAgent);

  let agent: AgentProfile | null;
  try {
    agent = await getAgentByOwnerName(handle, name);
  } catch (err) {
    if (getErrorMessage(err).includes("Invalid agent ID")) notFound();
    throw err;
  }
  if (!agent) notFound();

  const resolved = await resolveAgentPages(agent);

  const principal = await getPrincipal();
  const index = await listReadableWikiPages(principal);
  const bySlug = new Map(index.map((p) => [p.slug, p]));
  const titleFor = (slug: string) => bySlug.get(slug)?.title ?? slug;
  const hrefFor = (slug: string) =>
    pagePath(ownerToTenant(bySlug.get(slug)?.owner), slug);

  // Knowledge = the agent's accumulated learnings + social wisdom, rendered as
  // a card list (the same component the user profile uses).
  const knowledgeEntries: IndexEntry[] = [
    ...resolved.learningPages,
    ...resolved.socialPages,
  ]
    .map((slug) => bySlug.get(slug))
    .filter((e): e is IndexEntry => Boolean(e));

  const statsMap = await getDiscussionStatsForSlugs(
    knowledgeEntries.map((e) => e.slug),
  );
  const discussionStats: Record<string, { total: number; open: number }> = {};
  for (const [slug, stats] of statsMap) discussionStats[slug] = stats;

  const canManage = !!principal && agent.owner === principal.handle;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <Link
          href={`/u/${handle}`}
          className="text-sm text-foreground/50 hover:text-foreground"
        >
          ← @{handle}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{agent.name}</h1>
        <p className="mt-1 text-foreground/60">{agent.description}</p>
        {agent.owner && (
          <p className="mt-3 text-sm text-foreground/50">
            owned by{" "}
            <Link href={`/u/${agent.owner}`} className="hover:text-foreground">
              @{agent.owner}
            </Link>
          </p>
        )}
      </div>

      {canManage && <AgentTokenPanel agentId={agent.id} />}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Knowledge
        </h2>
        {knowledgeEntries.length === 0 ? (
          <p className="text-foreground/60">
            No knowledge yet — this agent hasn&rsquo;t ingested anything.
          </p>
        ) : (
          <WikiIndexClient
            pages={knowledgeEntries}
            discussionStats={discussionStats}
          />
        )}
      </section>

      {/* Filter to readable slugs (bySlug is the readable set) so a private
          identity page's slug doesn't leak to non-owners. */}
      <LinkSection
        label="Identity"
        slugs={resolved.identityPages.filter((s) => bySlug.has(s))}
        titleFor={titleFor}
        hrefFor={hrefFor}
      />
    </main>
  );
}

/** A simple labeled list of page links (used for Identity and Shared). */
function LinkSection({
  label,
  slugs,
  titleFor,
  hrefFor,
}: {
  label: string;
  slugs: string[];
  titleFor: (slug: string) => string;
  hrefFor: (slug: string) => string;
}) {
  if (slugs.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </h2>
      <ul className="space-y-1">
        {slugs.map((slug) => (
          <li key={slug}>
            <Link
              href={hrefFor(slug)}
              className="text-foreground hover:underline"
            >
              {titleFor(slug)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
