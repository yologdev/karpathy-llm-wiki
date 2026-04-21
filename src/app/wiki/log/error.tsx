"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function LogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Log error"
      description="Something went wrong loading the activity log."
      backHref="/wiki"
      backLabel="← Back to wiki"
      error={error}
      reset={reset}
    />
  );
}
