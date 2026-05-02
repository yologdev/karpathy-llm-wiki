import Link from "next/link";
import { buildContributorProfile } from "@/lib/contributors";

interface ContributorDetailProps {
  params: Promise<{ handle: string }>;
}

/** Map trust score to a visual indicator. */
function trustIndicator(score: number): {
  color: string;
  bg: string;
  label: string;
} {
  if (score >= 0.7)
    return {
      color: "text-green-700 dark:text-green-400",
      bg: "bg-green-100 dark:bg-green-900/30",
      label: "Established",
    };
  if (score >= 0.3)
    return {
      color: "text-yellow-700 dark:text-yellow-400",
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
      label: "Growing",
    };
  return {
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-100 dark:bg-gray-800/50",
    label: "New",
  };
}

/** Truncate an ISO date string to YYYY-MM-DD. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default async function ContributorDetailPage({
  params,
}: ContributorDetailProps) {
  const { handle } = await params;
  const decodedHandle = decodeURIComponent(handle);
  const profile = await buildContributorProfile(decodedHandle);

  // Zero activity = effectively not found
  const hasActivity =
    profile.editCount > 0 ||
    profile.commentCount > 0 ||
    profile.threadsCreated > 0;

  if (!hasActivity) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <Link
            href="/wiki/contributors"
            className="text-sm text-foreground/60 hover:text-foreground transition-colors"
          >
            ← Back to contributors
          </Link>
        </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight">
          {decodedHandle}
        </h1>
        <p className="text-foreground/60">
          No activity found for this contributor. They may not have any edits or
          discussion comments yet.
        </p>
      </main>
    );
  }

  const trust = trustIndicator(profile.trustScore);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/wiki/contributors"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Back to contributors
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {decodedHandle}
        </h1>
        <span
          className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-medium ${trust.bg} ${trust.color}`}
        >
          {trust.label} · Trust {profile.trustScore.toFixed(2)}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Edits" value={profile.editCount} />
        <StatCard label="Pages edited" value={profile.pagesEdited} />
        <StatCard label="Comments" value={profile.commentCount} />
        <StatCard label="Threads created" value={profile.threadsCreated} />
        <StatCard label="First seen" value={formatDate(profile.firstSeen)} />
        <StatCard label="Last seen" value={formatDate(profile.lastSeen)} />
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <dt className="text-xs font-medium text-foreground/60">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
