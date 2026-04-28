interface BatchProgressBarProps {
  total: number;
  completed: number;
  successCount: number;
  running: boolean;
}

export function BatchProgressBar({
  total,
  completed,
  successCount,
  running,
}: BatchProgressBarProps) {
  return (
    <>
      {/* Progress summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/70">
          {running
            ? `Processing... ${completed} of ${total} complete`
            : `${successCount} of ${total} URL${total === 1 ? "" : "s"} ingested successfully`}
        </p>
        {running && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-foreground/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-300"
          style={{
            width: `${total > 0 ? (completed / total) * 100 : 0}%`,
          }}
        />
      </div>
    </>
  );
}
