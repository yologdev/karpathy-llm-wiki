/**
 * The canonical set of `/query` answer formats, in one dependency-free module so
 * the type can be shared by both server code (`query.ts`, the history route) and
 * client code (the query page, its hook, and result/history components) without
 * dragging the Node storage layer into the client bundle.
 *
 * `QUERY_FORMATS` is the single runtime source of truth; derive validators from
 * it so the type and the runtime check can't drift when a format is added.
 */
export const QUERY_FORMATS = ["prose", "table", "slides", "html"] as const;

export type QueryFormat = (typeof QUERY_FORMATS)[number];

/** Type guard: is `value` one of the known answer formats? */
export function isQueryFormat(value: unknown): value is QueryFormat {
  return (
    typeof value === "string" &&
    (QUERY_FORMATS as readonly string[]).includes(value)
  );
}
