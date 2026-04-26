"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function WikiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Wiki error"
      description="Something went wrong while loading the wiki."
      backHref="/"
      backLabel="← Home"
      error={error}
      reset={reset}
    />
  );
}
