export default function QueryLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6">
        <div className="h-8 w-36 animate-pulse rounded bg-foreground/10" />
      </div>

      <div className="flex gap-6">
        {/* History sidebar placeholder */}
        <div className="hidden w-48 shrink-0 space-y-2 md:block">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-foreground/10" />
          ))}
        </div>

        {/* Search area */}
        <div className="flex-1 space-y-4">
          <div className="h-10 w-full animate-pulse rounded-md bg-foreground/10" />
          <div className="h-10 w-28 animate-pulse rounded-md bg-foreground/10" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading query…</span>
      </div>
    </main>
  );
}
