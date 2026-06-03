import { rawRelPath } from "@/lib/wiki";
import { getStorage } from "@/lib/storage";
import { isEnoent } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/assets/[...path]
 *
 * Serves a binary asset (image) that was stored during ingest. Ingested images
 * live at the storage key `raw/assets/{slug}/{file}` and are referenced in
 * markdown by the relative path `assets/{slug}/{file}` (see `downloadImages` in
 * `lib/fetch.ts`). This route maps a request path back to that storage key and
 * streams the bytes with the right Content-Type.
 *
 * Public + read-only: the middleware only gates write methods on `/api`.
 */

/** Map a file extension to a Content-Type. */
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

function contentTypeFor(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Reject a path segment that could escape the assets dir. */
function isUnsafeSegment(seg: string): boolean {
  return (
    seg.length === 0 ||
    seg === "." ||
    seg === ".." ||
    seg.includes("/") ||
    seg.includes("\\") ||
    seg.includes("\0")
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;

  // Traversal guard: the filesystem provider resolves keys with path.resolve,
  // so a `..` segment could otherwise escape the data dir. 404 (not 400) to
  // avoid leaking which paths exist.
  if (!segments?.length || segments.some(isUnsafeSegment)) {
    return new Response(null, { status: 404 });
  }

  // markdown ref `assets/<...>` → storage key `raw/assets/<...>` (rawRelPath is
  // the single source of truth used by the writer, so a RAW_DIR override stays
  // consistent).
  const storageKey = rawRelPath(`assets/${segments.join("/")}`);

  let bytes: ArrayBuffer;
  try {
    bytes = await getStorage().readAsset(storageKey);
  } catch (err) {
    // A genuinely missing asset is a 404; anything else (R2 outage, binding
    // failure) is a real incident — surface it as 500 + log so it isn't
    // indistinguishable from "file not found".
    if (isEnoent(err)) return new Response(null, { status: 404 });
    logger.error("assets", `readAsset failed for ${storageKey}`, err);
    return new Response(null, { status: 500 });
  }

  const name = segments[segments.length - 1];
  const contentType = contentTypeFor(name);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  // SVGs are served same-origin and can carry inline script — sandbox + a
  // restrictive CSP let them render as images without executing anything.
  if (contentType === "image/svg+xml") {
    headers["Content-Security-Policy"] =
      "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    headers["Content-Disposition"] = "inline";
  }

  return new Response(bytes, { status: 200, headers });
}
