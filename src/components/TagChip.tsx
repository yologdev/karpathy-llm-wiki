import Link from "next/link";

/** A clickable topic chip (links to a filtered browse view). */
export function TagChip({
  tag,
  count,
  href,
}: {
  tag: string;
  count?: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
    >
      <span>#{tag}</span>
      {count !== undefined && (
        <span className="text-xs text-foreground/40 tabular-nums">{count}</span>
      )}
    </Link>
  );
}
