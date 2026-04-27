export default function LogLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Back link placeholder */}
      <div className="mb-4 h-4 w-24 animate-pulse rounded bg-foreground/10" />

      <div className="mb-6">
        <div className="h-8 w-48 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Log line placeholders */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-foreground/10" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading log…</span>
      </div>
    </main>
  );
}
