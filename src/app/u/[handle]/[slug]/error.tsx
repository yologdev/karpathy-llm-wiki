"use client";

import { PageError } from "@/components/ErrorBoundary";

export default function WikiPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      title="Page error"
      description="Something went wrong loading this wiki page."
      backHref="/wiki"
      backLabel="← Back to wiki"
      error={error}
      reset={reset}
    />
  );
}
