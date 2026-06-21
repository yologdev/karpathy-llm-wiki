import type { MetadataRoute } from "next";

/**
 * PWA manifest. Beyond making yopedia installable, its real job is the **Web
 * Share Target**: once installed (Android Chrome especially), yopedia appears in
 * the OS share sheet, and sharing a link does `GET /save?url=&title=&text=` →
 * the capture page ingests it. iOS Safari doesn't support share_target (the
 * /save guide documents an Apple Shortcut for that case).
 *
 * `share_target` isn't in Next's `MetadataRoute.Manifest` type yet, so we build
 * the object and cast — Next JSON-serializes it verbatim, so the field IS emitted
 * in `/manifest.webmanifest`. (See share-target.test.ts, which asserts the shape.)
 */
export default function manifest(): MetadataRoute.Manifest {
  // Typed base (so display/icons are validated), then graft on share_target and
  // cast — Next serializes the whole object, so share_target reaches the output.
  const base: MetadataRoute.Manifest = {
    name: "yopedia — a shared second brain for humans and agents",
    short_name: "yopedia",
    description: "Save any link to yopedia for ingesting into the commons.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return {
    ...base,
    share_target: {
      action: "/save",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
