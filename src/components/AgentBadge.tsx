/**
 * A small teal chip marking an *agent* actor, set apart from human
 * contributors (indigo). Makes "humans AND agents" legible without folding
 * agents into the human contributor list.
 */
export function AgentBadge({ className }: { className?: string }) {
  return (
    <span
      className={`receipt inline-flex items-center gap-1 rounded-full border border-agent/30 bg-agent/10 px-1.5 py-px text-[10px] font-medium text-agent ${
        className ?? ""
      }`}
      title="Autonomous agent contribution"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-agent"
      />
      agent
    </span>
  );
}
