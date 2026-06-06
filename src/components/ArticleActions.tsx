"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { rawPath } from "@/lib/links";
import { ReingestButton } from "@/components/ReingestButton";
import { DeletePageButton } from "@/components/DeletePageButton";
import { SaveToVaultButton } from "@/components/SaveToVaultButton";

interface ArticleActionsProps {
  slug: string;
  /** The page's canonical tenant — for the Edit / View-source links. */
  tenant: string;
  /** The page owner handle (lowercased compare against the viewer's username). */
  owner: string;
  /** Contributor handles. */
  contributors: string[];
  /** Whether this is a PUBLIC, non-agent commons page (gates the curate button). */
  isCommonsPage: boolean;
  /** Whether a raw source exists (gates the View-source link). */
  hasRawSource: boolean;
  /** Whether a source URL exists (gates the Reingest button). */
  hasSourceUrl: boolean;
}

/**
 * The article action bar — self-gating per-viewer. ArticleView renders the same
 * context-free article for everyone (cacheable); this client island reads the
 * Clerk session and shows only the actions the signed-in viewer is allowed:
 *
 *   - View raw        — when a raw source exists.
 *   - Reingest        — owner/contributor, when a source URL exists.
 *   - Delete          — owner only.
 *   - Save to vault    — signed-in non-owner/contributor on a commons page.
 *
 * There is intentionally NO human "Edit page" button: in the commons-first
 * model pages are maintained by agents (via API/MCP), not hand-edited here.
 *
 * These are CONVENIENCE gates only; every underlying route re-authorizes the
 * request server-side, so a stale/forged client never bypasses the real check.
 */
export function ArticleActions({
  slug,
  tenant,
  owner,
  contributors,
  isCommonsPage,
  hasRawSource,
  hasSourceUrl,
}: ArticleActionsProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  // Resolve the viewer's handle the SAME way the server does (auth.ts
  // resolveHandle): prefer the Clerk username, else the username on the X/Twitter
  // external account (Twitter-SSO users often have no Clerk username set).
  const handle =
    user?.username ??
    user?.externalAccounts?.find(
      (a) => typeof a.provider === "string" && /(^|_)(x|twitter)$/i.test(a.provider),
    )?.username ??
    null;
  // Owner/contributor gating is case-insensitive (owner/contributors are stored
  // lowercased server-side).
  const handleLc = handle?.toLowerCase() ?? null;

  const isOwner = !!handleLc && handleLc === owner.toLowerCase();
  const ownsOrContributes =
    !!handleLc &&
    (isOwner || contributors.some((c) => c.toLowerCase() === handleLc));
  // Curate is for pulling in OTHERS' commons pages (your own are implicitly in
  // your vault), so it shows only to signed-in non-owner/contributor viewers.
  const canCurate =
    isLoaded && !!isSignedIn && isCommonsPage && !ownsOrContributes;

  return (
    <div className="mt-12 border-t border-rule pt-6 flex flex-wrap items-center gap-3">
      {hasRawSource && (
        <Link href={rawPath(tenant, slug)} className="btn">
          View raw
        </Link>
      )}
      {hasSourceUrl && ownsOrContributes && <ReingestButton slug={slug} />}
      {canCurate && <SaveToVaultButton slug={slug} />}
      {isOwner && <DeletePageButton slug={slug} />}
    </div>
  );
}
