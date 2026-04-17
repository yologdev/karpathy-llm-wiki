/**
 * Extract a human-readable message from an unknown caught value.
 *
 * Handles Error instances, plain strings, and falls back to a default message
 * for anything else (null, undefined, numbers, objects, etc.).
 */
export function getErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Check whether an unknown caught value is a Node.js ENOENT (file-not-found) error. */
export function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}
