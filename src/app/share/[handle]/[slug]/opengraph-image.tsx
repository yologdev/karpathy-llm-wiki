import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, tenantForOwner } from "@/lib/wiki";
import { canReadFrontmatter } from "@/lib/authz";
import { str } from "@/lib/share-url";
import { logger } from "@/lib/logger";

// Per-page OG card. Rendered at REQUEST time (a slug is created after build, so
// it can't be force-static) — verified to run on the Worker runtime.
export const dynamic = "force-dynamic";

export const alt = "A yopedia page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Canonical origin (matches metadataBase in layout.tsx) — the base for the
// self-hosted font fetch below. We deliberately do NOT trust the request `Host`
// header for this: it's client-controlled, so a spoofed Host would aim the font
// subrequest at an arbitrary origin and feed those bytes to Satori. localhost is
// allowed only so local `wrangler dev` can serve the font.
const SITE_ORIGIN = "https://yopedia.yolog.dev";

// The node-constellation mark, inline so the image is self-contained (mirrors
// the root opengraph-image).
const MARK = `<svg width="120" height="120" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#b8b2a4" stroke-width="1.4" stroke-linecap="round" opacity="0.6">
    <line x1="5" y1="8" x2="12" y2="5"/><line x1="12" y1="5" x2="19" y2="10"/>
    <line x1="12" y1="5" x2="13" y2="18"/><line x1="5" y1="8" x2="13" y2="18"/>
    <line x1="13" y1="18" x2="19" y2="10"/>
  </g>
  <circle cx="5" cy="8" r="2" fill="#cfc8b8"/><circle cx="19" cy="10" r="2" fill="#cfc8b8"/>
  <circle cx="13" cy="18" r="2" fill="#cfc8b8"/><circle cx="12" cy="5" r="2.7" fill="#4d6bfe"/>
</svg>`;
const MARK_URI = `data:image/svg+xml,${encodeURIComponent(MARK)}`;

/** Human label for the page type, shown as a small kicker. */
function typeLabel(type: string | undefined): string {
  switch (type) {
    case "html":
      return "Artifact";
    case "slides":
      return "Slides";
    case "agent-knowledge":
      return "Agent note";
    default:
      return "Page";
  }
}

// Self-hosted CJK-capable subset (GB2312 hanzi + Latin + punctuation, ~2.2MB)
// served from /public — NOT an external CDN. Cached as a single promise for the
// isolate's lifetime; a failed fetch is evicted (rethrown after delete) so the
// next request retries. Satori needs ttf/otf bytes; without this a Chinese title
// would render as tofu boxes.
let fontPromise: Promise<ArrayBuffer> | null = null;
function loadFont(origin: string): Promise<ArrayBuffer> {
  if (!fontPromise) {
    fontPromise = fetch(`${origin}/fonts/noto-sc-subset.ttf`)
      .then((r) => {
        if (!r.ok) throw new Error(`font fetch ${r.status}`);
        return r.arrayBuffer();
      })
      .catch((e) => {
        fontPromise = null; // don't cache a failure — the next request retries
        throw e;
      });
  }
  return fontPromise;
}

export default async function ShareOgImage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);

  // The page read can THROW on malformed frontmatter (parseFrontmatter) — must
  // not 500 the card (a 500 unfurls as no-image for crawlers). Fall back to the
  // generic card and log it.
  let page: Awaited<ReturnType<typeof readWikiPageWithFrontmatter>> = null;
  try {
    page = await readWikiPageWithFrontmatter(slug);
  } catch (err) {
    logger.warn("og-image", `page read threw for "${slug}" — rendering the generic card`, err);
  }

  // Render the real title ONLY for a non-private page whose handle matches its
  // owner tenant — never leak a private/misattributed page's title to a crawler.
  const showRealTitle = Boolean(
    page &&
      canReadFrontmatter(page.frontmatter, null) &&
      handle.toLowerCase() === tenantForOwner(str(page.frontmatter.owner)),
  );

  const title = showRealTitle ? page!.title || slug : "yopedia";
  const kicker = showRealTitle
    ? `${typeLabel(str(page!.frontmatter.type))} · @${handle}`
    : "a shared second brain for humans and agents";

  // Cap the title so a very long one doesn't overflow the card.
  const shownTitle = title.length > 90 ? `${title.slice(0, 88)}…` : title;

  // Load the CJK-capable font from our canonical origin; degrade to the default
  // font (Satori's built-in, Latin only — a CJK title will TOFU) rather than 500
  // if it can't be fetched. Logged so the degradation is visible, not silent.
  let fonts: { name: string; data: ArrayBuffer; weight: 400; style: "normal" }[] | undefined;
  try {
    const host = (await headers()).get("host") ?? "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const data = await loadFont(isLocal ? `http://${host}` : SITE_ORIGIN);
    fonts = [{ name: "Noto Sans SC", data, weight: 400, style: "normal" }];
  } catch (err) {
    logger.warn("og-image", `font load failed; rendering without the CJK font for "${slug}"`, err);
    fonts = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fbfaf6",
          color: "#1b1a16",
          padding: "72px 80px",
          fontFamily: '"Noto Sans SC", sans-serif',
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img src={MARK_URI} width={72} height={72} alt="" />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>yopedia</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, color: "#756f62", letterSpacing: 0.2 }}>{kicker}</div>
          <div
            style={{
              display: "flex",
              fontSize: shownTitle.length > 48 ? 60 : 76,
              fontWeight: 700,
              letterSpacing: -1,
              lineHeight: 1.14,
              color: "#1b1a16",
            }}
          >
            {shownTitle}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
          <div style={{ width: 13, height: 13, borderRadius: 7, background: "#4d6bfe" }} />
          <span style={{ color: "#756f62" }}>yopedia.yolog.dev</span>
          <span style={{ marginLeft: "auto", color: "#a59e8d" }}>growing in public</span>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fonts ? { fonts } : {}),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
