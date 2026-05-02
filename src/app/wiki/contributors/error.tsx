"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function ContributorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Contributors error"
      description="Something went wrong loading the contributors list."
      backHref="/wiki"
      backLabel="← Back to wiki"
      error={error}
      reset={reset}
    />
  );
}
