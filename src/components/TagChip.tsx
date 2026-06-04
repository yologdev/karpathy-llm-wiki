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
      className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm text-muted hover:bg-surface-strong hover:text-foreground transition-colors"
    >
      <span>#{tag}</span>
      {count !== undefined && (
        <span className="text-xs text-foreground/40 tabular-nums">{count}</span>
      )}
    </Link>
  );
}
