import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { decodeSlug } from "@/lib/slugify";
import { readWikiPageWithFrontmatter, tenantForOwner } from "@/lib/wiki";
import { canReadFrontmatter } from "@/lib/authz";
import { str } from "@/lib/share-url";

// Per-page OG card. Rendered at REQUEST time (a slug is created after build, so
// it can't be force-static) — verified to run on the Worker runtime.
export const dynamic = "force-dynamic";

export const alt = "A yopedia page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

// Self-hosted CJK-capable subset (GB2312 hanzi + Latin + punctuation, ~2.2MB),
// served from /public — NOT an external CDN. Fetched once per isolate from our
// own origin (failed fetches aren't cached). Satori needs ttf/otf bytes; without
// this a Chinese title would render as tofu boxes.
const fontCache = new Map<string, Promise<ArrayBuffer>>();
function loadFont(origin: string): Promise<ArrayBuffer> {
  let p = fontCache.get(origin);
  if (!p) {
    p = fetch(`${origin}/fonts/noto-sc-subset.ttf`)
      .then((r) => {
        if (!r.ok) throw new Error(`font fetch ${r.status}`);
        return r.arrayBuffer();
      })
      .catch((e) => {
        fontCache.delete(origin); // don't cache a failure
        throw e;
      });
    fontCache.set(origin, p);
  }
  return p;
}

export default async function ShareOgImage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug: encodedSlug } = await params;
  const slug = decodeSlug(encodedSlug);
  const page = await readWikiPageWithFrontmatter(slug);

  // Only render the real title for a PUBLIC page whose handle matches its owner
  // tenant — never leak a private/misattributed page's title to a crawler.
  const readable = page && canReadFrontmatter(page.frontmatter, null);
  const tenantOk =
    page && handle.toLowerCase() === tenantForOwner(str(page.frontmatter.owner));

  const title = readable && tenantOk ? page!.title || slug : "yopedia";
  const kicker =
    readable && tenantOk
      ? `${typeLabel(str(page!.frontmatter.type))} · @${handle}`
      : "a shared second brain for humans and agents";

  // Cap the title so a very long one doesn't overflow the card.
  const shownTitle = title.length > 90 ? `${title.slice(0, 88)}…` : title;

  // Load the CJK-capable font from our own origin; degrade to the default font
  // (Latin only) rather than 500 if it can't be fetched.
  let fonts: { name: string; data: ArrayBuffer; weight: 400; style: "normal" }[] | undefined;
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      const data = await loadFont(`${proto}://${host}`);
      fonts = [{ name: "Noto Sans SC", data, weight: 400, style: "normal" }];
    }
  } catch {
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
