import Link from "next/link";
import { readWikiPage } from "@/lib/wiki";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { DeletePageButton } from "@/components/DeletePageButton";

interface WikiPageProps {
  params: Promise<{ slug: string }>;
}

export default async function WikiPageView({ params }: WikiPageProps) {
  const { slug } = await params;
  const page = await readWikiPage(slug);

  if (!page) {
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
          No wiki page exists for &ldquo;{slug}&rdquo;.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/wiki"
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to index
      </Link>
      <article className="mt-6">
        <MarkdownRenderer content={page.content} />
      </article>
      <div className="mt-12 border-t border-foreground/10 pt-6 flex items-center gap-3">
        <Link
          href={`/wiki/${slug}/edit`}
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors"
        >
          Edit page
        </Link>
        <DeletePageButton slug={slug} />
      </div>
    </main>
  );
}
