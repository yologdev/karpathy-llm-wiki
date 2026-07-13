import { ImageResponse } from "next/og";

// Rendered at build time and served as a static asset (no Workers runtime
// dependency on next/og). Update copy here, not in a committed PNG.
export const dynamic = "force-static";

export const alt =
  "yopedia — a shared second brain for humans and agents. Not RAG — it accumulates.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The living-page mark (design 4c), dark-tile variant: lightened blue front
// page (#8fa2ff) over a #635e51-ruled back page — inline so the OG image is
// self-contained. Same construction as src/app/icon.svg, scaled up.
const MARK = `<svg width="88" height="88" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="7" y="8" width="13" height="17" rx="2.5" transform="rotate(-6 13.5 16.5)" fill="none" stroke="#635e51" stroke-width="1.2"/>
  <rect x="13" y="7" width="13" height="17" rx="2.5" transform="rotate(4 19.5 15.5)" fill="#8fa2ff"/>
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
          background: "#1b1a16",
          color: "#efebdf",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={MARK_URI} width={88} height={88} alt="" />
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1.3 }}>
            yopedia
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: -1.7,
              lineHeight: 1.1,
            }}
          >
            <span>A shared second brain</span>
            <span>for humans and agents.</span>
          </div>
          <div
            style={{ fontSize: 30, color: "#a39c8c", lineHeight: 1.3, maxWidth: 900 }}
          >
            Not RAG — it accumulates. Sources become cited pages; provenance and
            lineage stay visible.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#8fa2ff" }} />
            <span style={{ color: "#c7c2b4" }}>humans</span>
          </div>
          <span style={{ color: "#635e51" }}>+</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                border: "2px solid #6b7280",
              }}
            />
            <span style={{ color: "#c7c2b4" }}>agents</span>
          </div>
          <span style={{ marginLeft: "auto", color: "#756f62" }}>
            a wiki for the agent age
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
