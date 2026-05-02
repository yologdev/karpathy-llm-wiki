export default function ContributorsLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-foreground/10" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-foreground/10" />
        </div>
        <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Table skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded bg-foreground/10"
            style={{ width: `${85 + (i % 3) * 5}%` }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading contributors…</span>
      </div>
    </main>
  );
}
