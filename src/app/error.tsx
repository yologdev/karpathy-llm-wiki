"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Something went wrong"
      description="An unexpected error occurred."
      backHref="/"
      backLabel="Go home"
      error={error}
      reset={reset}
    />
  );
}
