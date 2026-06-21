"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { rawPath } from "@/lib/links";
import { isOwnerHandle } from "@/lib/owner";
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
 *   - Delete          — site owner/admin on a commons page; page owner on a
 *                       non-commons (private/artifact/agent) page.
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
  const isSiteOwner = isOwnerHandle(handleLc);
  const ownsOrContributes =
    !!handleLc &&
    (isOwner || contributors.some((c) => c.toLowerCase() === handleLc));
  // Mirror the server realm gate (authz.canWritePage with "delete") so the button
  // never shows a delete that 403s: a COMMONS page is operator-only (the site
  // owner / admin); a non-commons page (private / artifact / agent) is deletable
  // by its page owner. The site owner can delete either.
  const canDelete = isCommonsPage ? isSiteOwner : isOwner || isSiteOwner;
  // Any signed-in user can curate a commons page into their vault — including
  // owners and contributors (owned/contributed pages are NOT automatically in
  // vaults, so excluding them created a curation gap for the most engaged users).
  const canCurate = isLoaded && !!isSignedIn && isCommonsPage;

  return (
    <div className="mt-12 border-t border-rule pt-6 flex flex-wrap items-center gap-3">
      {hasRawSource && (
        <Link href={rawPath(tenant, slug)} className="btn">
          View raw
        </Link>
      )}
      {hasSourceUrl && ownsOrContributes && <ReingestButton slug={slug} />}
      {canCurate && <SaveToVaultButton slug={slug} />}
      {canDelete && <DeletePageButton slug={slug} />}
    </div>
  );
}
