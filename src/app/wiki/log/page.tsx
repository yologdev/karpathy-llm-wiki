import Link from "next/link";
import { readLog } from "@/lib/wiki";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export default async function LogPage() {
  const logContent = await readLog();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <Link
          href="/wiki"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Back to index
        </Link>
      </div>

      {logContent ? (
        <article className="font-mono text-sm leading-relaxed">
          <MarkdownRenderer content={logContent} />
        </article>
      ) : (
        <p className="text-foreground/60">
          No activity logged yet. Ingest some content to see the timeline.
        </p>
      )}
    </main>
  );
}
