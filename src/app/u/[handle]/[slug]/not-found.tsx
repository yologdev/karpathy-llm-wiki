import Link from "next/link";

export default function WikiPageNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/wiki"
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to index
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Page not found</h1>
      <p className="mt-4 text-foreground/60">
        This wiki page doesn&apos;t exist. Check the slug spelling or browse the{" "}
        <Link href="/wiki" className="underline hover:text-foreground">
          wiki index
        </Link>{" "}
        to find what you&apos;re looking for.
      </p>
      <p className="mt-2 text-foreground/60">
        You can also{" "}
        <Link href="/ingest" className="underline hover:text-foreground">
          ingest a new source
        </Link>{" "}
        to create new pages.
      </p>
    </main>
  );
}
