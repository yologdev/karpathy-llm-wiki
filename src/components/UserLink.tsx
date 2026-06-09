import Link from "next/link";
import { profileHref } from "@/lib/links";
import { isAgentHandle } from "@/lib/agent-handle";

/**
 * A handle rendered as `@handle`. Human handles link to their profile
 * (`/u/<handle>`); agent authors (e.g. yoyo's autonomous edits/comments) render
 * as plain text — they have no `/u/<handle>` profile. Use for plain-text
 * byline/author sites that don't use the {@link Mark} chip (comments, revisions).
 */
export function UserLink({
  handle,
  className,
}: {
  handle: string;
  className?: string;
}) {
  if (isAgentHandle(handle)) {
    return <span className={className}>@{handle}</span>;
  }
  return (
    <Link href={profileHref(handle)} className={className}>
      @{handle}
    </Link>
  );
}
