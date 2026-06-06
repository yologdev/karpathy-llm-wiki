import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "@/lib/slugify";
import { resolveSlugPath, type SlugTenantMap } from "@/lib/links";

interface MarkdownRendererProps {
  content: string;
  /**
   * Extra classes appended to the prose wrapper. Pass `"prose-article"` for
   * the long-form serif reading treatment (see globals.css); omit for the
   * neutral sans look used by query answers.
   */
  className?: string;
  /**
   * Pre-computed heading ids (h2/h3, document order) from the page's
   * `buildToc`. Consumed in order so the in-page Table of Contents anchors
   * match the rendered heading ids exactly — including dedupe suffixes. When
   * omitted (e.g. query answers), ids fall back to slugifying the heading text.
   */
  headingIds?: string[];
  /**
   * The linking page's tenant — the fallback for in-content `[x](slug.md)`
   * links whose target isn't in {@link slugTenants} (a dangling/new page). When
   * omitted, internal links fall back to the flat `/wiki/<slug>` route (which
   * 308-redirects to canonical) — used by client callers without a resolver.
   */
  tenant?: string;
  /**
   * Slug→tenant map so in-content links resolve to the canonical
   * `/u/<owner>/<slug>` even when the target belongs to another owner (pre-P5
   * slugs are globally unique). Computed server-side and passed as plain data.
   */
  slugTenants?: SlugTenantMap;
  /**
   * The set of PUBLIC commons slugs. When a target slug is in this set, the link
   * resolves to the global `/wiki/<slug>` instead of `/u/<tenant>/<slug>`.
   * Optional so existing callers stay correct (without it, every target resolves
   * to the owner-scoped form).
   */
  commonsSlugs?: ReadonlySet<string>;
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

export function MarkdownRenderer({
  content,
  className,
  headingIds,
  tenant,
  slugTenants,
  commonsSlugs,
}: MarkdownRendererProps) {
  const body = stripFrontmatter(content);
  // Headings render in document order; pull the next pre-computed id (which
  // already carries dedupe suffixes), falling back to slugifying the rendered
  // text when no list was supplied or it runs short.
  let headingIndex = 0;
  const nextHeadingId = (children: ReactNode): string => {
    if (headingIds && headingIndex < headingIds.length) {
      return headingIds[headingIndex++];
    }
    return slugify(headingText(children));
  };
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
          // them (the typography plugin emits no ids). IDs come from the page's
          // buildToc (via headingIds) so anchors and TOC links match exactly.
          h2: ({ children, ...props }) => (
            <h2 id={nextHeadingId(children)} {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 id={nextHeadingId(children)} {...props}>
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
            // Rewrite internal .md links to canonical owner-qualified routes.
            // `[x](slug.md)` is tenant-local in storage; we resolve the target's
            // real owner via slugTenants (cross-owner links stay correct), and
            // fall back to the linking page's tenant for dangling targets. When
            // no resolver/tenant is supplied (client callers), use the flat
            // /wiki/<slug> route, which 308-redirects to canonical.
            if (href && href.endsWith(".md") && !href.startsWith("http")) {
              const slug = href.replace(/\.md$/, "");
              const dest =
                tenant || slugTenants
                  ? resolveSlugPath(slug, slugTenants, tenant ?? "", commonsSlugs)
                  : `/wiki/${slug}`;
              return (
                <Link href={dest} {...props}>
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
