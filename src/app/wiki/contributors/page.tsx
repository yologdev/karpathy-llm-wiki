import Link from "next/link";
import { listContributors } from "@/lib/contributors";

/** Map trust score to a colored dot. */
function trustDot(score: number): { color: string; label: string } {
  if (score >= 0.7) return { color: "bg-green-500", label: "high" };
  if (score >= 0.3) return { color: "bg-yellow-500", label: "medium" };
  return { color: "bg-gray-400", label: "low" };
}

/** Truncate an ISO date string to YYYY-MM-DD. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default async function ContributorsPage() {
  const contributors = await listContributors();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contributors</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Everyone who has edited pages or participated in discussions.
          </p>
        </div>
        <Link
          href="/wiki"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Back to wiki
        </Link>
      </div>

      {contributors.length === 0 ? (
        <p className="text-foreground/60">
          No contributors yet. Ingest content and create revisions to see
          contributor profiles.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-foreground/60">
                <th className="pb-2 pr-4 font-medium">Handle</th>
                <th className="pb-2 pr-4 font-medium text-right">Edits</th>
                <th className="pb-2 pr-4 font-medium text-right">Pages</th>
                <th className="pb-2 pr-4 font-medium text-right">Comments</th>
                <th className="pb-2 pr-4 font-medium text-right">Trust</th>
                <th className="pb-2 font-medium text-right">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {contributors.map((c) => {
                const dot = trustDot(c.trustScore);
                return (
                  <tr
                    key={c.handle}
                    className="border-b border-foreground/5 hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/wiki/contributors/${encodeURIComponent(c.handle)}`}
                        className="inline-flex items-center gap-1.5 text-foreground hover:underline"
                      >
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${dot.color}`}
                          title={`Trust: ${dot.label}`}
                          aria-label={`Trust: ${dot.label}`}
                        />
                        {c.handle}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {c.editCount}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {c.pagesEdited}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {c.commentCount}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {c.trustScore.toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-foreground/60 tabular-nums">
                      {formatDate(c.lastSeen)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
