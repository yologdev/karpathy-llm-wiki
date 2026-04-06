import Link from "next/link";

const features = [
  {
    href: "/ingest",
    title: "Ingest",
    description:
      "Add sources to your wiki — paste a URL or raw text and let the LLM summarize and interlink it.",
  },
  {
    href: "/wiki",
    title: "Browse",
    description:
      "Explore your wiki pages, follow cross-references, and see how knowledge connects.",
  },
  {
    href: "/query",
    title: "Query",
    description:
      "Ask questions against your wiki and get cited answers drawn from your pages.",
  },
  {
    href: "/lint",
    title: "Lint",
    description:
      "Health-check your wiki for contradictions, orphan pages, and missing cross-references.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">LLM Wiki</h1>
        <p className="mt-6 text-lg text-foreground/70 leading-relaxed">
          Your personal knowledge base powered by LLMs. Ingest sources, ask
          questions, and browse an ever-growing wiki of interlinked markdown
          pages.
        </p>
      </div>

      <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map(({ href, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border border-gray-200 p-5 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-900/50"
          >
            <h2 className="text-lg font-semibold group-hover:underline">
              {title} <span className="inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </h2>
            <p className="mt-2 text-sm text-foreground/60 leading-relaxed">
              {description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
