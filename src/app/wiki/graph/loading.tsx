export default function GraphLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6">
        <div className="h-8 w-44 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Canvas placeholder */}
      <div className="h-[500px] w-full animate-pulse rounded-lg bg-foreground/10" />

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading graph…</span>
      </div>
    </main>
  );
}
