"use client";

import { useEffect, useState } from "react";

/**
 * Render a `yoyo-illustration` directive (from a ` ```yoyo-illustration ` fenced
 * block in a slide) as a generated yoyo brand image. Fetches `/api/illustrate`
 * on mount; renders nothing if generation fails (an illustration is an
 * enhancement, never a blocker).
 */
export function YoyoIllustration({
  scene,
  lang = "English",
}: {
  scene: string;
  lang?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setDone(false);
    fetch("/api/illustrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene, lang }),
    })
      .then((r) => (r.ok ? r.json() : { image: null }))
      .then((d: { image?: string | null }) => {
        if (!cancelled) {
          setSrc(d.image ?? null);
          setDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scene, lang]);

  if (done && !src) return null; // generation failed — show nothing
  if (!src) {
    return (
      <div
        className="receipt"
        style={{ color: "var(--muted)", fontSize: 12, padding: "16px 0" }}
      >
        Drawing the yoyo illustration…
      </div>
    );
  }
  return (
    <figure className="yoyo-illustration" style={{ textAlign: "center", margin: "1.25rem 0" }}>
      {/* Generated data-URI image; a plain <img> is correct (no next/image loader). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={scene} style={{ maxWidth: "100%", height: "auto" }} />
    </figure>
  );
}
