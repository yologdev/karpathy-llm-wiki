"use client";

import Link from "next/link";
import { getErrorHint } from "@/lib/error-hints";

interface PageErrorProps {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export function PageError({
  title,
  description,
  backHref,
  backLabel,
  error,
  reset,
}: PageErrorProps) {
  const hint = getErrorHint(error.message);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-foreground/60">{description}</p>
      <p className="mt-4 rounded-lg border border-red-500/20 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
        {error.message}
      </p>
      {hint && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <p>{hint.suggestion}</p>
          {hint.action && (
            <Link
              href={hint.action.href}
              className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              {hint.action.label}
            </Link>
          )}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Try again
        </button>
        <Link
          href={backHref}
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
