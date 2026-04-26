export default function IngestLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded bg-foreground/10" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Tab bar skeleton */}
      <div className="mb-6 flex gap-2">
        <div className="h-9 w-20 animate-pulse rounded-md bg-foreground/10" />
        <div className="h-9 w-20 animate-pulse rounded-md bg-foreground/10" />
        <div className="h-9 w-20 animate-pulse rounded-md bg-foreground/10" />
      </div>

      {/* Form area skeleton */}
      <div className="space-y-4 rounded-lg border border-foreground/10 p-6">
        <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
        <div className="h-10 w-full animate-pulse rounded-md bg-foreground/10" />
        <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
        <div className="h-32 w-full animate-pulse rounded-md bg-foreground/10" />
        <div className="h-10 w-32 animate-pulse rounded-md bg-foreground/10" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading ingest…</span>
      </div>
    </main>
  );
}
