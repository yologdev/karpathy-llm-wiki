import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "@/lib/slugify";

interface MarkdownRendererProps {
  content: string;
  /**
   * Extra classes appended to the prose wrapper. Pass `"prose-article"` for
   * the long-form serif reading treatment (see globals.css); omit for the
   * neutral sans look used by query answers.
   */
  className?: string;
}

/** Flatten ReactMarkdown heading children to plain text for anchor IDs. */
function headingText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (
    children &&
    typeof children === "object" &&
    "props" in children &&
    (children as { props?: { children?: ReactNode } }).props
  ) {
    return headingText(
      (children as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
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

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const body = stripFrontmatter(content);
  return (
    <div
      className={`prose prose-neutral dark:prose-invert max-w-none${
        className ? ` ${className}` : ""
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Stable heading IDs so an in-page Table of Contents can anchor to
          // them (the typography plugin emits no ids). Slugs match the TOC's
          // because both use the same `slugify`.
          h2: ({ children, ...props }) => (
            <h2 id={slugify(headingText(children))} {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 id={slugify(headingText(children))} {...props}>
              {children}
            </h3>
          ),
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
