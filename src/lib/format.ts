/**
 * Shared formatting utilities used across the app.
 */

/**
 * Format an ISO timestamp as a short relative string such as "just now",
 * "5m ago", "3h ago", "2d ago", "1w ago", "4mo ago", or "1y ago".
 *
 * Returns the first 10 characters of `iso` (i.e. `YYYY-MM-DD`) when the
 * input cannot be parsed as a valid date.
 */
export function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso.slice(0, 10);

  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
