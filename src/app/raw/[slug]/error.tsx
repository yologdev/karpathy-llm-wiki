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
      backHref="/raw"
      backLabel="← Sources"
      error={error}
      reset={reset}
    />
  );
}
