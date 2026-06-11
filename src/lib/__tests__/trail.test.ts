import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate trailEventsForPages from storage: stub the page/revision reads and
// keep the real actor-normalization (agent-handle) + parseSources.
vi.mock("../wiki", () => ({
  listReadableWikiPages: vi.fn(),
  readWikiPageWithFrontmatter: vi.fn(),
  isAgentScopedType: () => false,
  ownerToTenant: (o?: string) => o ?? "commons",
}));
vi.mock("../revisions", () => ({ listRevisions: vi.fn() }));

import { trailEventsForPages } from "../trail";
import { readWikiPageWithFrontmatter } from "../wiki";
import { listRevisions } from "../revisions";

const mockedReadPage = vi.mocked(readWikiPageWithFrontmatter);
const mockedListRevisions = vi.mocked(listRevisions);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("trailEventsForPages — actor normalization", () => {
  it("folds an automation actor (lint-fix) into the agent for ingests and edits", async () => {
    mockedReadPage.mockResolvedValue({
      frontmatter: {
        sources: JSON.stringify([
          {
            type: "youtube",
            url: "https://youtu.be/x",
            fetched: "2026-06-10T00:00:00.000Z",
            triggered_by: "lint-fix",
          },
        ]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedListRevisions.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { author: "lint-fix", timestamp: 1_700_000_000_000, date: "2026-06-10" } as any,
    ]);

    const events = await trailEventsForPages([
      { slug: "about-poke", title: "About Poke" },
    ]);

    expect(events.length).toBeGreaterThanOrEqual(2);
    // No raw automation actor leaks into the feed.
    expect(events.every((e) => e.actor === "yoyo")).toBe(true);
    expect(events.every((e) => e.isAgent)).toBe(true);
    expect(events.map((e) => e.action).sort()).toEqual(["edited", "ingested"]);
  });

  it("keeps a real human actor unchanged", async () => {
    mockedReadPage.mockResolvedValue({
      frontmatter: {
        sources: JSON.stringify([
          {
            type: "url",
            url: "https://example.com",
            fetched: "2026-06-10T00:00:00.000Z",
            triggered_by: "alice",
          },
        ]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedListRevisions.mockResolvedValue([]);

    const events = await trailEventsForPages([{ slug: "p", title: "P" }]);
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("alice");
    expect(events[0].isAgent).toBe(false);
  });
});
