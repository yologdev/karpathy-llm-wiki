import { ImageResponse } from "next/og";

// Rendered at build time and served as a static asset (no Workers runtime
// dependency on next/og). Update copy here, not in a committed PNG.
export const dynamic = "force-static";

export const alt =
  "yopedia — a shared second brain for humans and agents. Not RAG — it accumulates.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The node-constellation mark, inline so the OG image is self-contained.
const MARK = `<svg width="120" height="120" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#d4d4d8" stroke-width="1.4" stroke-linecap="round" opacity="0.5">
    <line x1="5" y1="8" x2="12" y2="5"/><line x1="12" y1="5" x2="19" y2="10"/>
    <line x1="12" y1="5" x2="13" y2="18"/><line x1="5" y1="8" x2="13" y2="18"/>
    <line x1="13" y1="18" x2="19" y2="10"/>
  </g>
  <circle cx="5" cy="8" r="2" fill="#e4e4e7"/><circle cx="19" cy="10" r="2" fill="#e4e4e7"/>
  <circle cx="13" cy="18" r="2" fill="#e4e4e7"/><circle cx="12" cy="5" r="2.7" fill="#818cf8"/>
</svg>`;
const MARK_URI = `data:image/svg+xml,${encodeURIComponent(MARK)}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0b",
          color: "#ededed",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={MARK_URI} width={84} height={84} alt="" />
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            yopedia
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.1,
            }}
          >
            <span>A shared second brain</span>
            <span>for humans and agents.</span>
          </div>
          <div style={{ fontSize: 30, color: "#a1a1aa", lineHeight: 1.3, maxWidth: 900 }}>
            Not RAG — it accumulates. Sources become cited pages; provenance and
            lineage stay visible.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#818cf8" }} />
            <span style={{ color: "#d4d4d8" }}>humans</span>
          </div>
          <span style={{ color: "#52525b" }}>+</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#2dd4bf" }} />
            <span style={{ color: "#d4d4d8" }}>agents</span>
          </div>
          <span style={{ marginLeft: "auto", color: "#71717a" }}>growing in public</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
