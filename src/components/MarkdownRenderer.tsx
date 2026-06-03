import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Strip a leading YAML frontmatter block (`---\n...\n---\n?`) before
 * rendering so users never see raw YAML in the browser. We intentionally
 * don't import `parseFrontmatter` from `lib/wiki` — this component runs
 * inside React server/client boundaries and we want zero coupling to the
 * parser.
 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?\n?/, "");
}

/**
 * Resolve a markdown image `src` to something the browser can load. Images
 * ingested from sources are stored as assets and referenced by the relative
 * path `assets/{slug}/{file}` (or occasionally the physical `raw/assets/...`);
 * those are served by `/api/assets/...`. Absolute URLs (http(s)/data) are left
 * untouched so images that weren't downloaded still render.
 */
function resolveImageSrc(src: string): string {
  if (
    src.startsWith("data:") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("/api/assets/")
  ) {
    return src;
  }
  const ref = src.startsWith("raw/assets/") ? src.slice("raw/".length) : src;
  if (ref.startsWith("assets/")) {
    return `/api/assets/${ref.slice("assets/".length)}`;
  }
  return src;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const body = stripFrontmatter(content);
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt, ...props }) => {
            if (typeof src !== "string") return null;
            return (
              // Source images come from arbitrary origins/our asset route, not a
              // configured next/image loader, so a plain <img> is correct here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveImageSrc(src)}
                alt={alt ?? ""}
                loading="lazy"
                style={{ maxWidth: "100%", height: "auto" }}
                {...props}
              />
            );
          },
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
        {body}
      </ReactMarkdown>
    </div>
  );
}
