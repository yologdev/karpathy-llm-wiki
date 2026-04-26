export default function LintLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <div className="h-8 w-40 animate-pulse rounded bg-foreground/10" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Action bar skeleton */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-36 animate-pulse rounded-md bg-foreground/10" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-foreground/10" />
      </div>

      {/* Placeholder issue cards */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-foreground/10 p-4"
          >
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 animate-pulse rounded-full bg-foreground/10" />
              <div className="h-4 w-48 animate-pulse rounded bg-foreground/10" />
            </div>
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-foreground/10" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-foreground/10" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Running lint checks…</span>
      </div>
    </main>
  );
}
