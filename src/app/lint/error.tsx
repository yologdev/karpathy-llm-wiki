"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function LintError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Lint error"
      description="Something went wrong running lint checks."
      backHref="/"
      backLabel="← Home"
      error={error}
      reset={reset}
    />
  );
}
