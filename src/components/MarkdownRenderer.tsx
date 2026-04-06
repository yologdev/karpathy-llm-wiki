import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            // Rewrite internal .md links to /wiki/ routes using Next.js Link
            if (href && href.endsWith(".md") && !href.startsWith("http")) {
              const slug = href.replace(/\.md$/, "");
              return (
                <Link href={`/wiki/${slug}`} {...props}>
                  {children}
                </Link>
              );
            }
            // External links: open in new tab
            const isExternal =
              href &&
              (href.startsWith("http://") || href.startsWith("https://"));
            return (
              <a
                href={href}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
