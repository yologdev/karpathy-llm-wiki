import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isYouTubeUrl,
  extractVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,
  formatTranscriptAsMarkdown,
  fetchYouTubeContent,
} from "../youtube";
import { YoutubeTranscript } from "youtube-transcript";

// ---------------------------------------------------------------------------
// Mock youtube-transcript library
// ---------------------------------------------------------------------------

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

const mockFetchTranscript = vi.mocked(YoutubeTranscript.fetchTranscript);

// ---------------------------------------------------------------------------
// isYouTubeUrl
// ---------------------------------------------------------------------------

describe("isYouTubeUrl", () => {
  it("returns true for youtube.com/watch URLs", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
    expect(isYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
  });

  it("returns true for youtu.be short URLs", () => {
    expect(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("returns true for youtube.com/shorts URLs", () => {
    expect(
      isYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe(true);
  });

  it("returns false for non-YouTube URLs", () => {
    expect(isYouTubeUrl("https://example.com")).toBe(false);
    expect(isYouTubeUrl("https://vimeo.com/12345")).toBe(false);
    expect(isYouTubeUrl("not-a-url")).toBe(false);
  });

  it("returns false for YouTube URLs that aren't video pages", () => {
    expect(isYouTubeUrl("https://www.youtube.com/channel/UCxyz")).toBe(false);
    expect(isYouTubeUrl("https://www.youtube.com/playlist?list=abc")).toBe(
      false,
    );
  });

  it("handles case-insensitive hostnames", () => {
    // URL constructor lowercases hostnames, so this should work
    expect(isYouTubeUrl("https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// extractVideoId
// ---------------------------------------------------------------------------

describe("extractVideoId", () => {
  it("extracts ID from youtube.com/watch?v=VIDEO_ID", () => {
    expect(
      extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from youtu.be/VIDEO_ID", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts ID from youtube.com/shorts/VIDEO_ID", () => {
    expect(
      extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("handles extra query params and fragments", () => {
    expect(
      extractVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLxyz",
      ),
    ).toBe("dQw4w9WgXcQ");
    expect(
      extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=30"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URLs", () => {
    expect(extractVideoId("https://example.com/watch?v=abc")).toBeNull();
  });

  it("returns null for invalid video IDs", () => {
    // Too short
    expect(
      extractVideoId("https://www.youtube.com/watch?v=abc"),
    ).toBeNull();
    // Missing v param
    expect(
      extractVideoId("https://www.youtube.com/watch?list=PLxyz"),
    ).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(extractVideoId("not-a-url")).toBeNull();
    expect(extractVideoId("")).toBeNull();
  });

  it("handles IDs with dashes and underscores", () => {
    expect(
      extractVideoId("https://www.youtube.com/watch?v=a-B_c1D2e3F"),
    ).toBe("a-B_c1D2e3F");
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeMetadata
// ---------------------------------------------------------------------------

describe("fetchYouTubeMetadata", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed metadata from oEmbed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Test Video",
        thumbnail_url: "https://img.youtube.com/vi/abc/hqdefault.jpg",
        author_name: "Test Channel",
      }),
    }) as unknown as typeof fetch;

    const result = await fetchYouTubeMetadata("dQw4w9WgXcQ");
    expect(result).toEqual({
      title: "Test Video",
      thumbnailUrl: "https://img.youtube.com/vi/abc/hqdefault.jpg",
      authorName: "Test Channel",
    });
  });

  it("throws on HTTP errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await expect(fetchYouTubeMetadata("nonexistent")).rejects.toThrow(
      /404/,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeTranscript
// ---------------------------------------------------------------------------

describe("fetchYouTubeTranscript", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.YOUTUBE_TRANSCRIPT_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.YOUTUBE_TRANSCRIPT_API_KEY = originalEnv;
    } else {
      delete process.env.YOUTUBE_TRANSCRIPT_API_KEY;
    }
  });

  it("returns transcript from youtube-transcript library", async () => {
    mockFetchTranscript.mockResolvedValue([
      { text: "Hello world", offset: 0, duration: 5000, lang: "en" },
      { text: "Second line", offset: 5000, duration: 3000, lang: "en" },
    ]);

    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result).toEqual({
      segments: [
        { text: "Hello world", offset: 0, duration: 5000 },
        { text: "Second line", offset: 5000, duration: 3000 },
      ],
      language: "en",
    });
  });

  it("falls back to API when library throws and API key is set", async () => {
    mockFetchTranscript.mockRejectedValue(
      new Error("IP blocked"),
    );
    process.env.YOUTUBE_TRANSCRIPT_API_KEY = "test-key";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { text: "API transcript", offset: 0, duration: 4000 },
        ],
        lang: "en",
      }),
    }) as unknown as typeof fetch;

    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result).toEqual({
      segments: [{ text: "API transcript", offset: 0, duration: 4000 }],
      language: "en",
    });
  });

  it("returns null when both library and API fail", async () => {
    mockFetchTranscript.mockRejectedValue(
      new Error("No captions"),
    );
    // No API key set
    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatTranscriptAsMarkdown
// ---------------------------------------------------------------------------

describe("formatTranscriptAsMarkdown", () => {
  const metadata = {
    title: "Test Video",
    authorName: "Test Channel",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  };

  it("includes header with metadata", () => {
    const result = formatTranscriptAsMarkdown(
      [{ text: "Hello", offset: 0, duration: 5000 }],
      metadata,
    );
    expect(result).toContain("# Test Video");
    expect(result).toContain("**Channel:** Test Channel");
    expect(result).toContain(metadata.videoUrl);
    expect(result).toContain("## Transcript");
  });

  it("formats timestamps as [MM:SS]", () => {
    const result = formatTranscriptAsMarkdown(
      [{ text: "Hello", offset: 65000, duration: 5000 }],
      metadata,
    );
    expect(result).toContain("[01:05]");
  });

  it("handles empty segments gracefully", () => {
    const result = formatTranscriptAsMarkdown([], metadata);
    expect(result).toContain("No transcript segments available");
  });

  it("groups segments into paragraphs at ~30 second boundaries", () => {
    // Create segments: 4 x 10s = 40s total → should split into 2 paragraphs
    // First paragraph: segments 0-2 (cumulative 30s reached after seg 2)
    // Second paragraph: segment 3
    const segments = [
      { text: "First sentence.", offset: 0, duration: 10000 },
      { text: "Second sentence.", offset: 10000, duration: 10000 },
      { text: "Third sentence.", offset: 20000, duration: 10000 },
      { text: "Fourth sentence.", offset: 30000, duration: 10000 },
    ];

    const result = formatTranscriptAsMarkdown(segments, metadata);
    const transcriptSection = result.split("## Transcript\n\n")[1];

    // Should have a blank line separating paragraphs
    const paragraphs = transcriptSection
      .split("\n\n")
      .filter((p) => p.trim().length > 0);

    expect(paragraphs.length).toBe(2);

    // First paragraph should have timestamp [00:00] and contain first 3 segments
    expect(paragraphs[0]).toContain("[00:00]");
    expect(paragraphs[0]).toContain("First sentence.");
    expect(paragraphs[0]).toContain("Second sentence.");
    expect(paragraphs[0]).toContain("Third sentence.");

    // Second paragraph should have timestamp [00:30]
    expect(paragraphs[1]).toContain("[00:30]");
    expect(paragraphs[1]).toContain("Fourth sentence.");
  });

  it("keeps short transcripts in a single paragraph", () => {
    const segments = [
      { text: "Hello.", offset: 0, duration: 5000 },
      { text: "World.", offset: 5000, duration: 5000 },
    ];

    const result = formatTranscriptAsMarkdown(segments, metadata);
    const transcriptSection = result.split("## Transcript\n\n")[1];

    // Only one paragraph — no blank-line splits
    const paragraphs = transcriptSection
      .split("\n\n")
      .filter((p) => p.trim().length > 0);

    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]).toContain("[00:00]");
    expect(paragraphs[0]).toContain("Hello.");
    expect(paragraphs[0]).toContain("World.");
  });

  it("creates multiple paragraph breaks for long transcripts", () => {
    // 9 segments x 10s each = 90s → should create ~3 paragraphs
    const segments = Array.from({ length: 9 }, (_, i) => ({
      text: `Segment ${i + 1}.`,
      offset: i * 10000,
      duration: 10000,
    }));

    const result = formatTranscriptAsMarkdown(segments, metadata);
    const transcriptSection = result.split("## Transcript\n\n")[1];
    const paragraphs = transcriptSection
      .split("\n\n")
      .filter((p) => p.trim().length > 0);

    expect(paragraphs.length).toBe(3);

    // Each paragraph starts with a timestamp
    expect(paragraphs[0]).toMatch(/^\[00:00\]/);
    expect(paragraphs[1]).toMatch(/^\[00:30\]/);
    expect(paragraphs[2]).toMatch(/^\[01:00\]/);
  });
});

// ---------------------------------------------------------------------------
// fetchYouTubeContent (integration)
// ---------------------------------------------------------------------------

describe("fetchYouTubeContent", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns formatted content when metadata + transcript succeed", async () => {
    // Mock fetch for oEmbed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Great Video",
        thumbnail_url: "https://img.youtube.com/vi/dQw4w9WgXcQ/hq.jpg",
        author_name: "Cool Channel",
      }),
    }) as unknown as typeof fetch;

    // Mock transcript library
    mockFetchTranscript.mockResolvedValue([
      { text: "Hello world", offset: 0, duration: 5000, lang: "en" },
      { text: "This is great", offset: 5000, duration: 5000, lang: "en" },
    ]);

    const result = await fetchYouTubeContent(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result.title).toBe("Great Video");
    expect(result.thumbnailUrl).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hq.jpg",
    );
    expect(result.content).toContain("# Great Video");
    expect(result.content).toContain("**Channel:** Cool Channel");
    expect(result.content).toContain("## Transcript");
    expect(result.content).toContain("Hello world");
    expect(result.content).toContain("This is great");
  });

  it("returns fallback content when transcript is unavailable (no throw)", async () => {
    // Mock fetch for oEmbed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "No Captions Video",
        thumbnail_url: "https://img.youtube.com/vi/abc/hq.jpg",
        author_name: "Some Channel",
      }),
    }) as unknown as typeof fetch;

    // Mock transcript library — fails
    mockFetchTranscript.mockRejectedValue(
      new Error("Captions disabled"),
    );

    const result = await fetchYouTubeContent(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    // Should NOT throw
    expect(result.title).toBe("No Captions Video");
    expect(result.content).toContain("# No Captions Video");
    expect(result.content).toContain("Captions are unavailable");
    expect(result.content).toContain("**Channel:** Some Channel");
    expect(result.thumbnailUrl).toBe(
      "https://img.youtube.com/vi/abc/hq.jpg",
    );
  });

  it("throws when video is not found (oEmbed 404)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await expect(
      fetchYouTubeContent("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).rejects.toThrow(/404/);
  });

  it("throws for invalid YouTube URL", async () => {
    await expect(
      fetchYouTubeContent("https://example.com/not-youtube"),
    ).rejects.toThrow(/Invalid YouTube URL/);
  });
});
