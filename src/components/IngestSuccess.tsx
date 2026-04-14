import Link from "next/link";

interface IngestSuccessProps {
  slug: string;
  relatedUpdated: string[];
  onReset: () => void;
}

export function IngestSuccess({ slug, relatedUpdated, onReset }: IngestSuccessProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-lg border border-foreground/10 p-8 text-center">
        <p className="text-2xl font-semibold">✓ Ingested as wiki page</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            href={`/wiki/${slug}`}
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            View &ldquo;{slug}&rdquo; →
          </Link>
          {relatedUpdated.length > 0 && (
            <div className="mt-4 w-full max-w-md text-left">
              <p className="text-sm text-foreground/70">
                Also updated {relatedUpdated.length} related page
                {relatedUpdated.length === 1 ? "" : "s"}:
              </p>
              <ul className="mt-2 flex list-none flex-col gap-1 pl-0">
                {relatedUpdated.map((relatedSlug) => (
                  <li key={relatedSlug}>
                    <Link
                      href={`/wiki/${relatedSlug}`}
                      className="text-sm text-foreground/70 hover:text-foreground hover:underline transition-colors"
                    >
                      {relatedSlug}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-4 mt-2">
            <Link
              href="/wiki"
              className="text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              Back to wiki
            </Link>
            <button
              onClick={onReset}
              className="text-sm text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              Ingest another
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
