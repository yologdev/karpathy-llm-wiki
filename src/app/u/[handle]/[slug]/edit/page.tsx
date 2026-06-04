import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, tenantForOwner } from "@/lib/wiki";
import { pagePath, editPath } from "@/lib/links";
import { canReadFrontmatter } from "@/lib/authz";
import { getPrincipal } from "@/lib/auth";
import { WikiEditor } from "@/components/WikiEditor";

interface EditPageProps {
  params: Promise<{ handle: string; slug: string }>;
}

export default async function EditWikiPage({ params }: EditPageProps) {
  const { handle: encodedHandle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);

  // A private page the viewer can't read is indistinguishable from missing.
  if (!page || !canReadFrontmatter(page.frontmatter, await getPrincipal())) {
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

  // Canonical owner segment; 308 to the canonical edit URL on mismatch.
  const pageTenant = tenantForOwner(
    typeof page.frontmatter.owner === "string"
      ? page.frontmatter.owner
      : undefined,
  );
  if (decodeSlug(encodedHandle).toLowerCase() !== pageTenant) {
    permanentRedirect(editPath(pageTenant, slug));
  }

  // Extract the 7 patchable metadata fields from frontmatter for the editor.
  const fm = page.frontmatter;
  const initialMetadata = {
    confidence: typeof fm.confidence === "number" ? fm.confidence : null,
    disputed: fm.disputed === true,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    aliases: Array.isArray(fm.aliases) ? (fm.aliases as string[]) : [],
    expiry: typeof fm.expiry === "string" ? fm.expiry : "",
    valid_from: typeof fm.valid_from === "string" ? fm.valid_from : "",
    supersedes: typeof fm.supersedes === "string" ? fm.supersedes : "",
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={pagePath(pageTenant, slug)}
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to page
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        Editing: {page.title}
      </h1>
      <WikiEditor
        slug={slug}
        tenant={pageTenant}
        initialContent={page.body}
        initialMetadata={initialMetadata}
      />
    </main>
  );
}
