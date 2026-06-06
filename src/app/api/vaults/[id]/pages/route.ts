import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { addToVault, removeFromVault, vaultOwnedBy, getVault } from "@/lib/vault";
import { readWikiPageWithFrontmatter } from "@/lib/wiki";
import { belongsInCommons } from "@/lib/commons";

interface Params {
  params: Promise<{ id: string }>;
}

async function authorizeOwner(vaultId: string) {
  const principal = await getPrincipal();
  if (!principal) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (!vaultOwnedBy(vaultId, principal.handle)) {
    return { error: NextResponse.json({ error: "Not your vault." }, { status: 403 }) };
  }
  return { principal };
}

async function readSlug(req: Request): Promise<string | null> {
  try {
    const slug = ((await req.json()) as { slug?: unknown })?.slug;
    return typeof slug === "string" && slug.trim() ? slug : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/vaults/[id]/pages { slug } — add a page reference to a vault.
 *
 * v1 (public vaults): only a readable PUBLIC commons page can be referenced
 * (re-checked here, mirroring the MCP vault_curate gate).
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorizeOwner(id);
  if (auth.error) return auth.error;
  if (!(await getVault(id))) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  const slug = await readSlug(req);
  if (!slug) {
    return NextResponse.json({ error: "Missing or invalid 'slug'." }, { status: 400 });
  }
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }
  const isCommons = belongsInCommons({
    visibility:
      typeof page.frontmatter.visibility === "string"
        ? page.frontmatter.visibility
        : undefined,
    type: typeof page.frontmatter.type === "string" ? page.frontmatter.type : undefined,
  });
  if (!isCommons) {
    return NextResponse.json(
      { error: "Only public commons pages can be added to a public vault." },
      { status: 400 },
    );
  }
  await addToVault(id, slug);
  return NextResponse.json({ ok: true, added: slug });
}

/** DELETE /api/vaults/[id]/pages { slug } — remove a page reference. */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorizeOwner(id);
  if (auth.error) return auth.error;
  const slug = await readSlug(req);
  if (!slug) {
    return NextResponse.json({ error: "Missing or invalid 'slug'." }, { status: 400 });
  }
  await removeFromVault(id, slug);
  return NextResponse.json({ ok: true, removed: slug });
}
