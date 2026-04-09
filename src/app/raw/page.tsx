import Link from "next/link";
import { listRawSources, type RawSource } from "@/lib/wiki";

/** Human-readable byte size: `1.2 KB`, `45 KB`, `2.1 MB`, etc. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** "just now" / "5 minutes ago" / "3 days ago" / `YYYY-MM-DD` fallback. */
function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso.slice(0, 10);

  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec} seconds ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  // Older than a month: fall back to a stable date stamp.
  return iso.slice(0, 10);
}

export default async function RawIndex() {
  const sources: RawSource[] = await listRawSources();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Raw Sources</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Immutable source documents. The LLM&rsquo;s memory is built from these.
      </p>

      {sources.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-foreground/15 p-8 text-center">
          <p className="text-foreground/70">No raw sources yet.</p>
          <p className="mt-2 text-sm text-foreground/50">
            Add one via the{" "}
            <Link
              href="/ingest"
              className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
            >
              ingest
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-foreground/10 rounded-lg border border-foreground/10">
          {sources.map((source) => (
            <li key={source.slug}>
              <Link
                href={`/raw/${source.slug}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-foreground/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-medium text-foreground">
                    {source.filename}
                  </div>
                  <div className="mt-0.5 text-xs text-foreground/50">
                    {formatRelativeDate(source.modified)}
                  </div>
                </div>
                <div className="shrink-0 text-xs tabular-nums text-foreground/60">
                  {formatSize(source.size)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
