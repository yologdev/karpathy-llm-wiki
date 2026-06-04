import Link from "next/link";

export default function RawSourceNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/wiki"
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to the wiki
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Source not found</h1>
      <p className="mt-4 text-foreground/60">
        This page has no stored raw source, or the slug is wrong. Browse the{" "}
        <Link href="/wiki" className="underline hover:text-foreground">
          wiki
        </Link>{" "}
        or{" "}
        <Link href="/ingest" className="underline hover:text-foreground">
          ingest a new source
        </Link>
        .
      </p>
    </main>
  );
}
