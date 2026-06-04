import Link from "next/link";
import { readLog, listWikiPages } from "@/lib/wiki";
import { canReadEntry } from "@/lib/authz";
import { getPrincipal } from "@/lib/auth";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export default async function LogPage() {
  const raw = await readLog();

  // Redact log lines that mention a private page the viewer can't read — the
  // log records titles/slugs, which would otherwise leak. Skipped entirely in
  // the common case where there are no hidden pages.
  let logContent = raw;
  if (raw) {
    const principal = await getPrincipal();
    const hidden = (await listWikiPages()).filter(
      (p) => !canReadEntry(p, principal),
    );
    if (hidden.length > 0) {
      // Match the slug in the forms the log actually uses — `](slug.md)`
      // links, `slug: <slug>` ingest details, and `"<slug>"` dedup details —
      // plus the title. Anchored forms avoid the over-redaction a bare-slug
      // substring would cause, while still covering the bare-slug detail line.
      const needles = hidden
        .flatMap((p) => [
          `${p.slug}.md`,
          `slug: ${p.slug}`,
          `"${p.slug}"`,
          p.title,
        ])
        .filter((n): n is string => Boolean(n))
        .map((n) => n.toLowerCase());
      logContent = raw
        .split("\n")
        .filter((line) => {
          const l = line.toLowerCase();
          return !needles.some((n) => l.includes(n));
        })
        .join("\n");
    }
  }

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
        <article>
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
