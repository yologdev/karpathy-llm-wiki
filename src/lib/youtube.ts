/**
 * YouTube data fetching module.
 *
 * Self-contained layer for URL detection, video ID extraction, oEmbed
 * metadata retrieval, and transcript fetching with provider abstraction.
 * No dependencies on the ingest pipeline.
 */

import { YoutubeTranscript } from "youtube-transcript";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export interface TranscriptResult {
  segments: TranscriptSegment[];
  language: string;
}

export interface YouTubeMetadata {
  title: string;
  thumbnailUrl: string;
  authorName: string;
}

export interface YouTubeContent {
  title: string;
  content: string;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// URL detection
// ---------------------------------------------------------------------------

/** Known YouTube hostnames (case-insensitive matching). */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/**
 * Returns `true` for URLs matching supported YouTube formats:
 * `youtube.com/watch`, `youtu.be/`, `youtube.com/shorts/`,
 * `m.youtube.com/watch`, `www.youtube.com/watch`.
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return false;

    if (host === "youtu.be") return true;

    const p = parsed.pathname.toLowerCase();
    return p.startsWith("/watch") || p.startsWith("/shorts/");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Video ID extraction
// ---------------------------------------------------------------------------

/** YouTube video IDs are 11 characters: alphanumeric, dash, underscore. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the video ID from any supported YouTube URL format.
 * Returns `null` if no valid 11-char video ID can be found.
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (!YOUTUBE_HOSTS.has(host)) return null;

    // youtu.be/<VIDEO_ID>
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return VIDEO_ID_RE.test(id) ? id : null;
    }

    // youtube.com/shorts/<VIDEO_ID>
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];

    // youtube.com/watch?v=<VIDEO_ID>
    const v = parsed.searchParams.get("v");
    if (v && VIDEO_ID_RE.test(v)) return v;

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// oEmbed metadata
// ---------------------------------------------------------------------------

/**
 * Fetches YouTube video metadata via the public oEmbed endpoint (no API key).
 * Throws on HTTP errors (e.g. 404 for non-existent videos).
 */
export async function fetchYouTubeMetadata(
  videoId: string,
): Promise<YouTubeMetadata> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(oembedUrl);

  if (!res.ok) {
    throw new Error(
      `YouTube oEmbed request failed (HTTP ${res.status}): video "${videoId}" not found or unavailable`,
    );
  }

  const data = await res.json();
  return {
    title: data.title ?? "Untitled",
    thumbnailUrl: data.thumbnail_url ?? "",
    authorName: data.author_name ?? "Unknown",
  };
}

// ---------------------------------------------------------------------------
// Transcript fetching — API fallback
// ---------------------------------------------------------------------------

/**
 * Fetch transcript via a third-party API (currently Supadata).
 * Abstracted so the provider can be swapped later.
 */
async function fetchTranscriptViaApi(
  videoId: string,
  apiKey: string,
): Promise<TranscriptResult | null> {
  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );

    if (!res.ok) {
      logger.warn(
        "youtube",
        `Supadata transcript API returned ${res.status} for ${videoId}`,
      );
      return null;
    }

    const data = await res.json();

    // Supadata returns { content: [ { text, offset, duration } ], lang }
    // when text=true it may return { content: string, lang } — handle both.
    if (typeof data.content === "string") {
      // text-only mode — wrap in a single segment
      return {
        segments: [{ text: data.content, offset: 0, duration: 0 }],
        language: data.lang ?? "en",
      };
    }

    if (Array.isArray(data.content)) {
      return {
        segments: data.content.map(
          (s: { text: string; offset?: number; duration?: number }) => ({
            text: s.text ?? "",
            offset: s.offset ?? 0,
            duration: s.duration ?? 0,
          }),
        ),
        language: data.lang ?? "en",
      };
    }

    return null;
  } catch (err) {
    logger.warn("youtube", `Supadata transcript API error for ${videoId}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transcript fetching — primary
// ---------------------------------------------------------------------------

/**
 * Fetches the transcript for a YouTube video.
 *
 * **Primary path:** `youtube-transcript` npm package (direct scraping).
 * **Fallback:** Supadata API if `YOUTUBE_TRANSCRIPT_API_KEY` is set.
 *
 * Returns `null` if neither path succeeds.
 */
export async function fetchYouTubeTranscript(
  videoId: string,
): Promise<TranscriptResult | null> {
  // --- Primary: youtube-transcript library ---
  try {
    const raw = await YoutubeTranscript.fetchTranscript(videoId);
    if (raw.length > 0) {
      return {
        segments: raw.map((s) => ({
          text: s.text,
          offset: s.offset,
          duration: s.duration,
        })),
        language: raw[0].lang ?? "en",
      };
    }
  } catch (err) {
    logger.warn(
      "youtube",
      `youtube-transcript library failed for ${videoId}: ${err}`,
    );
  }

  // --- Fallback: API ---
  const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  if (apiKey) {
    logger.info("youtube", `Falling back to transcript API for ${videoId}`);
    return fetchTranscriptViaApi(videoId, apiKey);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Markdown formatting
// ---------------------------------------------------------------------------

/** Paragraph grouping threshold in milliseconds (~30 seconds). */
const PARAGRAPH_THRESHOLD_MS = 30_000;

/**
 * Formats a timestamp in milliseconds as `[MM:SS]`.
 */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}]`;
}

/**
 * Produces a markdown document from transcript segments and video metadata.
 *
 * Groups consecutive segments into paragraphs: accumulates segments until
 * cumulative duration exceeds ~30 seconds, then inserts a blank line and
 * starts a new paragraph. The first segment of each paragraph gets a
 * timestamp prefix.
 */
export function formatTranscriptAsMarkdown(
  segments: TranscriptSegment[],
  metadata: {
    title: string;
    authorName: string;
    videoUrl: string;
    thumbnailUrl: string;
  },
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${metadata.title}`);
  lines.push("");
  lines.push(`**Channel:** ${metadata.authorName}`);
  lines.push(
    `**Source:** [${metadata.videoUrl}](${metadata.videoUrl})`,
  );
  lines.push(`![thumbnail](${metadata.thumbnailUrl})`);
  lines.push("");
  lines.push("## Transcript");
  lines.push("");

  if (segments.length === 0) {
    lines.push("*No transcript segments available.*");
    return lines.join("\n");
  }

  // Group segments into paragraphs (~30s chunks)
  let cumulativeDuration = 0;
  let paragraphTexts: string[] = [];
  let paragraphTimestamp: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Start a new paragraph if we've exceeded the threshold
    if (cumulativeDuration >= PARAGRAPH_THRESHOLD_MS && paragraphTexts.length > 0) {
      // Flush the current paragraph
      const prefix = paragraphTimestamp ? `${paragraphTimestamp} ` : "";
      lines.push(`${prefix}${paragraphTexts.join(" ")}`);
      lines.push("");

      // Reset
      paragraphTexts = [];
      cumulativeDuration = 0;
      paragraphTimestamp = null;
    }

    // Record timestamp for the first segment of a new paragraph
    if (paragraphTimestamp === null) {
      paragraphTimestamp = formatTimestamp(seg.offset);
    }

    paragraphTexts.push(seg.text.trim());
    cumulativeDuration += seg.duration;
  }

  // Flush remaining paragraph
  if (paragraphTexts.length > 0) {
    const prefix = paragraphTimestamp ? `${paragraphTimestamp} ` : "";
    lines.push(`${prefix}${paragraphTexts.join(" ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// High-level entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point: fetches YouTube video content ready for ingestion.
 *
 * 1. Extracts video ID from URL (throws if invalid).
 * 2. Fetches oEmbed metadata (throws if video not found).
 * 3. Fetches transcript (falls back gracefully if unavailable).
 * 4. Returns formatted markdown content.
 */
export async function fetchYouTubeContent(
  url: string,
): Promise<YouTubeContent> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL: "${url}"`);
  }

  const metadata = await fetchYouTubeMetadata(videoId);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const transcript = await fetchYouTubeTranscript(videoId);

  if (transcript && transcript.segments.length > 0) {
    const content = formatTranscriptAsMarkdown(transcript.segments, {
      title: metadata.title,
      authorName: metadata.authorName,
      videoUrl,
      thumbnailUrl: metadata.thumbnailUrl,
    });

    return {
      title: metadata.title,
      content,
      thumbnailUrl: metadata.thumbnailUrl,
    };
  }

  // Fallback: no transcript available — return metadata-only content
  const fallbackLines = [
    `# ${metadata.title}`,
    "",
    `**Channel:** ${metadata.authorName}`,
    `**Source:** [${videoUrl}](${videoUrl})`,
    metadata.thumbnailUrl ? `![thumbnail](${metadata.thumbnailUrl})` : "",
    "",
    "*Captions are unavailable for this video. The content above is based on video metadata only.*",
  ].filter(Boolean);

  return {
    title: metadata.title,
    content: fallbackLines.join("\n"),
    thumbnailUrl: metadata.thumbnailUrl || undefined,
  };
}
