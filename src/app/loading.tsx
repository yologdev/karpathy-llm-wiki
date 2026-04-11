export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-2 text-foreground/50">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Loading…</span>
      </div>
    </main>
  );
}
