"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { providerLabel } from "@/lib/providers";

interface ProviderInfo {
  configured: boolean;
  provider: string | null;
  model: string | null;
  embeddingSupport: boolean;
}

interface OnboardingWizardProps {
  pageCount: number;
}

/** Green checkmark icon for completed steps. */
function CheckIcon() {
  return (
    <svg
      className="h-5 w-5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function OnboardingWizard({ pageCount }: OnboardingWizardProps) {
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => {
        if (!r.ok) throw new Error("status fetch failed");
        return r.json();
      })
      .then((data: ProviderInfo) => setProviderInfo(data))
      .catch(() => setFetchError(true));
  }, []);

  const llmConfigured = providerInfo?.configured ?? false;
  const hasPages = pageCount > 0;

  // Determine which step is active (first incomplete step)
  const activeStep = !llmConfigured ? 1 : !hasPages ? 2 : 3;

  const steps = [
    {
      number: 1,
      title: "Configure your LLM",
      completed: llmConfigured,
      description: llmConfigured
        ? `Connected to ${providerLabel(providerInfo!.provider!)}${providerInfo!.model ? ` (${providerInfo!.model})` : ""}`
        : "Choose a provider and set your API key so the wiki can generate pages.",
      href: "/settings",
      linkText: "Configure LLM →",
    },
    {
      number: 2,
      title: "Ingest your first source",
      completed: hasPages,
      description: hasPages
        ? `Your wiki has ${pageCount} ${pageCount === 1 ? "page" : "pages"}.`
        : "Paste a URL or text — the LLM will create a wiki page with summaries and cross-references.",
      href: "/ingest",
      linkText: "Ingest a source →",
    },
    {
      number: 3,
      title: "Ask your first question",
      completed: false,
      description:
        "Query your wiki and get cited answers drawn from your pages.",
      href: "/query",
      linkText: "Ask a question →",
    },
  ];

  return (
    <div className="mt-10 w-full max-w-2xl">
      <h2 className="text-xl font-semibold text-center mb-6">
        Getting Started
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950/50">
        <ol className="space-y-6">
          {steps.map((step) => {
            const isActive = step.number === activeStep;
            const isPast = step.number < activeStep;
            const showLink = !step.completed && (isActive || step.number === 3);

            return (
              <li key={step.number} className="flex gap-4">
                {/* Step number / checkmark circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      step.completed || isPast
                        ? "bg-green-500 text-white"
                        : isActive
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {step.completed || isPast ? (
                      <CheckIcon />
                    ) : (
                      step.number
                    )}
                  </div>
                  {/* Connector line (not on last step) */}
                  {step.number < steps.length && (
                    <div
                      className={`mt-1 h-full w-0.5 ${
                        step.completed || isPast
                          ? "bg-green-300 dark:bg-green-700"
                          : "bg-gray-200 dark:bg-gray-800"
                      }`}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <h3
                    className={`font-semibold ${
                      isActive
                        ? "text-foreground"
                        : step.completed || isPast
                          ? "text-green-700 dark:text-green-400"
                          : "text-foreground/50"
                    }`}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      step.completed || isPast
                        ? "text-green-600/80 dark:text-green-400/70"
                        : "text-foreground/60"
                    }`}
                  >
                    {/* While loading provider info, show a placeholder for step 1 */}
                    {step.number === 1 && !providerInfo && !fetchError
                      ? "Checking provider status…"
                      : step.number === 1 && fetchError
                        ? "Unable to check provider status. Visit Settings to configure."
                        : step.description}
                  </p>
                  {showLink && (
                    <Link
                      href={step.href}
                      className={`mt-2 inline-block rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                          : "border border-gray-300 text-foreground/70 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      }`}
                    >
                      {step.linkText}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
