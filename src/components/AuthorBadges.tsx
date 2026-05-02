"use client";

/**
 * AuthorBadges — client-side wrapper that renders ContributorBadge
 * components for a wiki page's authors list. Used in the server-rendered
 * PageMetadata to add trust dots without converting the whole page to
 * a client component.
 *
 * Falls back to plain author names if the contributor API is unavailable.
 */

import { ContributorBadge } from "./ContributorBadge";

interface AuthorBadgesProps {
  authors: string[];
  contributors: string[];
}

export function AuthorBadges({ authors, contributors }: AuthorBadgesProps) {
  if (authors.length === 0) return null;

  return (
    <div className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>By</span>
      {authors.map((author, i) => (
        <span key={author} className="inline-flex items-center">
          <ContributorBadge handle={author} />
          {i < authors.length - 1 && <span className="ml-1">,</span>}
        </span>
      ))}
      {contributors.length > 0 && (
        <span className="ml-1 text-gray-400 dark:text-gray-500">
          + {contributors.length}{" "}
          {contributors.length === 1 ? "contributor" : "contributors"}
        </span>
      )}
    </div>
  );
}
