"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function SourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Source error"
      description="Something went wrong loading raw sources."
      backHref="/"
      backLabel="← Home"
      error={error}
      reset={reset}
    />
  );
}
