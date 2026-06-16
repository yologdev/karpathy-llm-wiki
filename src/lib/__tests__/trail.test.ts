import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate trailEventsForPages from storage: stub the page/revision reads and
// keep the real actor-normalization (agent-handle) + parseSources.
vi.mock("../wiki", () => ({
  listReadableWikiPages: vi.fn(),
  readWikiPageWithFrontmatter: vi.fn(),
  // Real predicate behaviour — belongsInCommons (via ./commons) depends on these.
  isAgentScopedType: (t?: string) => typeof t === "string" && t.startsWith("agent-"),
  isArtifactType: (t?: string) => t === "html",
  tenantForOwner: (o?: string) => o ?? "commons",
  ownerToTenant: (o?: string) => o ?? "commons",
}));
vi.mock("../revisions", () => ({ listRevisionAuthors: vi.fn() }));

import { trailEventsForPages } from "../trail";
import { readWikiPageWithFrontmatter } from "../wiki";
import { listRevisionAuthors } from "../revisions";
import { logger } from "../logger";

const mockedReadPage = vi.mocked(readWikiPageWithFrontmatter);
const mockedListRevisionAuthors = vi.mocked(listRevisionAuthors);

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
    mockedListRevisionAuthors.mockResolvedValue([
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
    mockedListRevisionAuthors.mockResolvedValue([]);

    const events = await trailEventsForPages([{ slug: "p", title: "P" }]);
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("alice");
    expect(events[0].isAgent).toBe(false);
  });

  it("flags a public page commons=true and an artifact (html) page commons=false", async () => {
    const src = JSON.stringify([
      { type: "url", url: "https://e.com", fetched: "2026-06-10T00:00:00.000Z", triggered_by: "alice" },
    ]);
    mockedListRevisionAuthors.mockResolvedValue([]);

    // A plain public page → reachable at /wiki/<slug>.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedReadPage.mockResolvedValue({ frontmatter: { sources: src } } as any);
    let events = await trailEventsForPages([{ slug: "pub", title: "Pub" }]);
    expect(events[0].commons).toBe(true);

    // An `html` artifact (e.g. a query-answer) → lives ONLY at /u/<tenant>/<slug>.
    mockedReadPage.mockResolvedValue({
      frontmatter: { sources: src, type: "html" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    events = await trailEventsForPages([{ slug: "about-poke", title: "About Poke", owner: "yuanhao" }]);
    expect(events[0].commons).toBe(false);
    expect(events[0].tenant).toBe("yuanhao");
  });

  it("sets commons on EDIT events too (an artifact edit links owner-scoped)", async () => {
    // No sources → no ingest event; the lone event is from a revision (edit).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedReadPage.mockResolvedValue({ frontmatter: { type: "html" } } as any);
    mockedListRevisionAuthors.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { author: "alice", timestamp: 1_700_000_000_000, date: "2026-06-10" } as any,
    ]);
    const events = await trailEventsForPages([{ slug: "about-poke", title: "About Poke" }]);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("edited");
    expect(events[0].commons).toBe(false);
  });

  it("flags a private page commons=false (visibility branch)", async () => {
    const src = JSON.stringify([
      { type: "url", url: "https://e.com", fetched: "2026-06-10T00:00:00.000Z", triggered_by: "alice" },
    ]);
    mockedReadPage.mockResolvedValue({
      frontmatter: { sources: src, visibility: "private" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedListRevisionAuthors.mockResolvedValue([]);
    const events = await trailEventsForPages([{ slug: "secret", title: "Secret" }]);
    expect(events[0].commons).toBe(false);
  });

  it("defaults commons=false and logs when the page read fails (not a silent swallow)", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mockedReadPage.mockRejectedValue(new Error("R2 down"));
    mockedListRevisionAuthors.mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { author: "alice", timestamp: 1_700_000_000_000, date: "2026-06-10" } as any,
    ]);
    const events = await trailEventsForPages([{ slug: "p", title: "P" }]);
    expect(events).toHaveLength(1); // the edit event survives the read failure
    expect(events[0].commons).toBe(false);
    expect(warn).toHaveBeenCalled(); // the unexpected read error is surfaced
  });
});
