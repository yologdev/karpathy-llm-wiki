export default function SettingsLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <div className="h-8 w-40 animate-pulse rounded bg-foreground/10" />
      </div>

      {/* Provider form placeholders */}
      <div className="space-y-5 rounded-lg border border-foreground/10 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 w-28 animate-pulse rounded bg-foreground/10" />
            <div className="h-10 w-full animate-pulse rounded-md bg-foreground/10" />
          </div>
        ))}
        <div className="h-10 w-32 animate-pulse rounded-md bg-foreground/10" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading settings…</span>
      </div>
    </main>
  );
}
