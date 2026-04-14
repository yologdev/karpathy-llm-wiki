import Link from "next/link";
import { listRawSources, type RawSource } from "@/lib/wiki";
import { formatRelativeTime } from "@/lib/format";

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
                    {formatRelativeTime(source.modified)}
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
