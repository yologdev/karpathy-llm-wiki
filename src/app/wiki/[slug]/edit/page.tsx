import Link from "next/link";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { WikiEditor } from "@/components/WikiEditor";

interface EditPageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditWikiPage({ params }: EditPageProps) {
  const { slug } = await params;
  const page = await readWikiPageWithFrontmatter(slug);

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
          No wiki page exists for &ldquo;{slug}&rdquo; — nothing to edit.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={`/wiki/${slug}`}
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to page
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        Editing: {page.title}
      </h1>
      <WikiEditor slug={slug} initialContent={page.body} />
    </main>
  );
}
