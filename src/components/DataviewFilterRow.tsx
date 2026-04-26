"use client";

// ---------------------------------------------------------------------------
// Shared types & constants for dataview query building
// ---------------------------------------------------------------------------

export type DataviewOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "exists";

export interface FilterRow {
  id: number;
  field: string;
  op: DataviewOp;
  value: string;
}

export interface DataviewResultRow {
  slug: string;
  title: string;
  frontmatter: Record<string, string | string[]>;
}

export const OP_LABELS: Record<DataviewOp, string> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "contains",
  exists: "exists",
};

export const ALL_OPS: DataviewOp[] = [
  "eq",
  "neq",
  "gt",
  "lt",
  "gte",
  "lte",
  "contains",
  "exists",
];

let nextId = 1;

export function makeFilter(): FilterRow {
  return { id: nextId++, field: "", op: "eq", value: "" };
}

// ---------------------------------------------------------------------------
// DataviewFilterRow component
// ---------------------------------------------------------------------------

interface DataviewFilterRowProps {
  filter: FilterRow;
  onUpdate: (id: number, patch: Partial<Omit<FilterRow, "id">>) => void;
  onRemove: (id: number) => void;
}

export function DataviewFilterRow({
  filter,
  onUpdate,
  onRemove,
}: DataviewFilterRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        placeholder="field (e.g. tags)"
        value={filter.field}
        onChange={(e) => onUpdate(filter.id, { field: e.target.value })}
        className="w-36 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
      />
      <select
        value={filter.op}
        onChange={(e) =>
          onUpdate(filter.id, { op: e.target.value as DataviewOp })
        }
        className="rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
      >
        {ALL_OPS.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {filter.op !== "exists" && (
        <input
          type="text"
          placeholder="value"
          value={filter.value}
          onChange={(e) => onUpdate(filter.id, { value: e.target.value })}
          className="w-40 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30 transition-colors"
        />
      )}
      <button
        type="button"
        onClick={() => onRemove(filter.id)}
        className="rounded-md px-1.5 py-0.5 text-sm text-foreground/40 hover:text-foreground/80 transition-colors"
        aria-label="Remove filter"
      >
        ×
      </button>
    </div>
  );
}
