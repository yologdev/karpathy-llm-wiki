import Link from "next/link";
import { notFound } from "next/navigation";
import { readRawSource } from "@/lib/wiki";

interface RawSourcePageProps {
  params: Promise<{ slug: string }>;
}

/** Hard ceiling on how much raw content we render inline in the browser. */
const MAX_INLINE_BYTES = 500 * 1024; // 500 KB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export default async function RawSourcePage({ params }: RawSourcePageProps) {
  const { slug } = await params;

  let source;
  try {
    source = await readRawSource(slug);
  } catch {
    // readRawSource throws for both "not found" and "invalid slug" — in
    // either case the right response to the user is a 404.
    notFound();
  }

  // Raw sources can be arbitrarily large (full HTML pages, PDFs, ...).
  // Truncate anything above the inline budget and tell the user to use the
  // download link for the full content, so the browser never chokes.
  const tooLarge = source.size > MAX_INLINE_BYTES;
  const displayedContent = tooLarge
    ? source.content.slice(0, MAX_INLINE_BYTES)
    : source.content;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/raw"
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to raw sources
      </Link>

      <div className="mt-6">
        <h1 className="font-mono text-2xl font-bold break-all">
          {source.filename}
        </h1>
        <div className="mt-2 text-sm text-foreground/60">
          {formatSize(source.size)} · Modified{" "}
          {source.modified.slice(0, 10)} ·{" "}
          <a
            href={`/api/raw/${source.slug}`}
            className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
          >
            View raw
          </a>
        </div>
      </div>

      {tooLarge && (
        <div className="mt-6 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          File is {formatSize(source.size)} — showing the first{" "}
          {formatSize(MAX_INLINE_BYTES)}. Use the{" "}
          <a
            href={`/api/raw/${source.slug}`}
            className="underline hover:no-underline"
          >
            raw download
          </a>{" "}
          to see the full content.
        </div>
      )}

      <pre className="mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4 font-mono text-sm text-foreground/90">
        {displayedContent}
      </pre>
    </main>
  );
}
