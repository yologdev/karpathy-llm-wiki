import Link from "next/link";
import { profileHref } from "@/lib/links";

/**
 * A human handle rendered as `@handle` linking to its profile (`/u/<handle>`).
 * Use for plain-text byline/author sites that don't use the {@link Mark} chip
 * (e.g. comments, revision history). Agents are NOT users — don't use this for
 * agent ids.
 */
export function UserLink({
  handle,
  className,
}: {
  handle: string;
  className?: string;
}) {
  return (
    <Link href={profileHref(handle)} className={className}>
      @{handle}
    </Link>
  );
}
