import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentByOwnerName, resolveAgentPages, sharedPagesFor } from "@/lib/agents";
import { listWikiPages } from "@/lib/wiki";
import { decodeSlug } from "@/lib/slugify";
import { getErrorMessage } from "@/lib/errors";
import type { AgentProfile } from "@/lib/types";

// Public agent profile, scoped under its owner's handle:
//   /u/<handle>/a/<name>     e.g. /u/alice/a/yoyo
// Resolves the agent by (handle, name) and shows its EFFECTIVE identity /
// learnings / social pages — including everything inherited from its template
// (the base yoyo). Reads are public — yopedia is a public observer surface.
export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ handle: string; agent: string }>;
}) {
  const { handle: encodedHandle, agent: encodedAgent } = await params;
  const handle = decodeSlug(encodedHandle);
  const name = decodeSlug(encodedAgent);

  // getAgentByOwnerName returns null for a genuinely missing agent (ENOENT) and
  // throws on real errors (storage down, corrupt JSON). Don't flatten the latter
  // into a 404 — only a missing/malformed-id agent is "not found"; let real
  // errors propagate to the error boundary (500 + logging).
  let agent: AgentProfile | null;
  try {
    agent = await getAgentByOwnerName(handle, name);
  } catch (err) {
    if (getErrorMessage(err).includes("Invalid agent ID")) notFound();
    throw err;
  }
  if (!agent) notFound();

  // Effective pages = own + inherited from the template chain (the base yoyo),
  // plus pages the owner shared into this agent's context.
  const resolved = await resolveAgentPages(agent);
  const sharedSlugs = await sharedPagesFor(agent.id);

  // Resolve slug -> title from the index for nicer links (fall back to slug).
  const index = await listWikiPages();
  const titleFor = new Map(index.map((p) => [p.slug, p.title]));

  const sections: { label: string; slugs: string[] }[] = [
    { label: "Identity", slugs: resolved.identityPages },
    { label: "Learnings", slugs: resolved.learningPages },
    { label: "Social wisdom", slugs: resolved.socialPages },
    { label: "Shared by owner", slugs: sharedSlugs },
  ];
  const totalPages = sections.reduce((n, s) => n + s.slugs.length, 0);

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
        <AgentMeta agent={agent} />
      </div>

      {totalPages === 0 ? (
        <p className="text-foreground/60">
          This agent has no knowledge pages yet.
        </p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) =>
            section.slugs.length === 0 ? null : (
              <section key={section.label}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                  {section.label}
                </h2>
                <ul className="space-y-1">
                  {section.slugs.map((slug) => (
                    <li key={slug}>
                      <Link
                        href={`/wiki/${slug}`}
                        className="text-foreground hover:underline"
                      >
                        {titleFor.get(slug) ?? slug}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </main>
  );
}

/** Owner cross-link under the agent header. */
function AgentMeta({ agent }: { agent: AgentProfile }) {
  if (!agent.owner) return null;
  return (
    <p className="mt-3 text-sm text-foreground/50">
      owned by{" "}
      <Link href={`/u/${agent.owner}`} className="hover:text-foreground">
        @{agent.owner}
      </Link>
    </p>
  );
}
