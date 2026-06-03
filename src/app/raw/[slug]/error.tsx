"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function RawSourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Source view error"
      description="Something went wrong while loading this source."
      backHref="/wiki"
      backLabel="← Back to the wiki"
      error={error}
      reset={reset}
    />
  );
}
