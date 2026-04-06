import Link from "next/link";
import { listWikiPages } from "@/lib/wiki";

export default async function WikiIndex() {
  const pages = await listWikiPages();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Wiki</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/ingest"
            className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            Ingest
          </Link>
          <Link
            href="/"
            className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            ← Home
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <Link
          href="/wiki/log"
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
        >
          📋 Activity Log
        </Link>
      </div>

      {pages.length === 0 ? (
        <p className="text-foreground/60">
          No wiki pages yet. Ingest some content to get started!
        </p>
      ) : (
        <ul className="space-y-3">
          {pages.map((page) => (
            <li key={page.slug}>
              <Link
                href={`/wiki/${page.slug}`}
                className="group block rounded-lg border border-foreground/10 p-4 hover:border-foreground/30 transition-colors"
              >
                <span className="font-medium group-hover:underline">
                  {page.title}
                </span>
                <span className="mt-1 block text-sm text-foreground/60">
                  {page.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
