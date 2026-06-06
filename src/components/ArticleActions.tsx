"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { editPath, rawPath } from "@/lib/links";
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
 *   - Edit            — always (the edit route enforces auth).
 *   - View source     — when a raw source exists.
 *   - Reingest        — owner/contributor, when a source URL exists.
 *   - Delete          — owner only.
 *   - Save to vault    — signed-in non-owner/contributor on a commons page.
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
  const username = user?.username ?? null;

  const isOwner = !!username && username === owner;
  const ownsOrContributes =
    !!username && (isOwner || contributors.includes(username));
  // Curate is for pulling in OTHERS' commons pages (your own are implicitly in
  // your vault), so it shows only to signed-in non-owner/contributor viewers.
  const canCurate =
    isLoaded && !!isSignedIn && isCommonsPage && !ownsOrContributes;

  // Fetch vault membership only when the curate button would actually show.
  const [inVault, setInVault] = useState<boolean | null>(null);
  useEffect(() => {
    if (!canCurate) {
      setInVault(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/vault/status?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { inVault: false }))
      .then((d: { inVault?: boolean }) => {
        if (!cancelled) setInVault(!!d.inVault);
      })
      .catch(() => {
        if (!cancelled) setInVault(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canCurate, slug]);

  return (
    <div className="mt-12 border-t border-rule pt-6 flex flex-wrap items-center gap-3">
      <Link href={editPath(tenant, slug)} className="btn">
        Edit page
      </Link>
      {hasRawSource && (
        <Link href={rawPath(tenant, slug)} className="btn">
          View source
        </Link>
      )}
      {hasSourceUrl && ownsOrContributes && <ReingestButton slug={slug} />}
      {canCurate && inVault !== null && (
        <SaveToVaultButton slug={slug} initiallyInVault={inVault} />
      )}
      {isOwner && <DeletePageButton slug={slug} />}
    </div>
  );
}
