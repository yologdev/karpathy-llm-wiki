// ---------------------------------------------------------------------------
// SourceBadge — shows where a setting value came from (env / config / default)
// ---------------------------------------------------------------------------

type SettingSource = "env" | "config" | "default" | "none";

export function SourceBadge({ source }: { source: SettingSource }) {
  if (source === "env") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        from environment
      </span>
    );
  }
  if (source === "config") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/50">
        from config
      </span>
    );
  }
  if (source === "default") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/40">
        default
      </span>
    );
  }
  return null;
}
