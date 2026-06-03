/** A single hero stat — a big number with a small label. */
export function StatCard({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-foreground/50">{label}</span>
    </div>
  );
}
