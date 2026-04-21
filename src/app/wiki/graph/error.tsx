"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function GraphError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Graph error"
      description="Something went wrong loading the wiki graph."
      backHref="/wiki"
      backLabel="← Back to wiki"
      error={error}
      reset={reset}
    />
  );
}
