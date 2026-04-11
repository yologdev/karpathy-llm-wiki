import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock wiki.ts and lifecycle.ts — the modules lint-fix.ts depends on
// ---------------------------------------------------------------------------

vi.mock("../wiki", () => ({
  readWikiPage: vi.fn(),
  listWikiPages: vi.fn(),
  updateIndex: vi.fn(),
  appendToLog: vi.fn(),
}));

vi.mock("../lifecycle", () => ({
  writeWikiPageWithSideEffects: vi.fn(async () => ({
    slug: "test",
    updatedSlugs: [],
  })),
  deleteWikiPage: vi.fn(async () => ({
    slug: "test",
    removedFromIndex: true,
    strippedBacklinksFrom: [],
  })),
}));

vi.mock("../llm", () => ({
  callLLM: vi.fn(async () => "# Rewritten Page\n\nResolved content."),
}));

import { readWikiPage, listWikiPages, updateIndex, appendToLog } from "../wiki";
import {
  writeWikiPageWithSideEffects,
  deleteWikiPage,
} from "../lifecycle";
import { callLLM } from "../llm";

import {
  fixOrphanPage,
  fixStaleIndex,
  fixEmptyPage,
  fixMissingCrossRef,
  fixContradiction,
  fixLintIssue,
  FixValidationError,
  FixNotFoundError,
} from "../lint-fix";

const mockedReadWikiPage = vi.mocked(readWikiPage);
const mockedListWikiPages = vi.mocked(listWikiPages);
const mockedUpdateIndex = vi.mocked(updateIndex);
const mockedAppendToLog = vi.mocked(appendToLog);
const mockedWriteWikiPageWithSideEffects = vi.mocked(
  writeWikiPageWithSideEffects,
);
const mockedDeleteWikiPage = vi.mocked(deleteWikiPage);
const mockedCallLLM = vi.mocked(callLLM);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// fixOrphanPage
// ---------------------------------------------------------------------------

describe("fixOrphanPage", () => {
  it("throws FixValidationError when slug is empty", async () => {
    await expect(fixOrphanPage("")).rejects.toThrow(FixValidationError);
    await expect(fixOrphanPage("")).rejects.toThrow(
      "Missing required field: slug",
    );
  });

  it("throws FixNotFoundError when page does not exist", async () => {
    mockedReadWikiPage.mockResolvedValue(null);

    await expect(fixOrphanPage("no-such-page")).rejects.toThrow(
      FixNotFoundError,
    );
    await expect(fixOrphanPage("no-such-page")).rejects.toThrow(
      "Page not found: no-such-page",
    );
  });

  it("adds orphan page to index via writeWikiPageWithSideEffects", async () => {
    mockedReadWikiPage.mockResolvedValue({
      slug: "orphan",
      title: "Orphan Page",
      content: "# Orphan Page\n\nSome content about orphans.",
      path: "/wiki/orphan.md",
    });

    const result = await fixOrphanPage("orphan");

    expect(result).toEqual({
      success: true,
      slug: "orphan",
      message: "Added orphan to index",
    });

    expect(mockedWriteWikiPageWithSideEffects).toHaveBeenCalledOnce();
    const call = mockedWriteWikiPageWithSideEffects.mock.calls[0][0];
    expect(call.slug).toBe("orphan");
    expect(call.title).toBe("Orphan Page");
    expect(call.content).toBe("# Orphan Page\n\nSome content about orphans.");
    expect(call.summary).toBe("Some content about orphans.");
    expect(call.logOp).toBe("edit");
    expect(call.crossRefSource).toBeNull();
  });

  it("falls back to slug as summary when no first paragraph", async () => {
    mockedReadWikiPage.mockResolvedValue({
      slug: "bare",
      title: "bare",
      content: "No heading here",
      path: "/wiki/bare.md",
    });

    await fixOrphanPage("bare");

    const call = mockedWriteWikiPageWithSideEffects.mock.calls[0][0];
    expect(call.summary).toBe("bare");
  });
});

// ---------------------------------------------------------------------------
// fixStaleIndex
// ---------------------------------------------------------------------------

describe("fixStaleIndex", () => {
  it("throws FixValidationError when slug is empty", async () => {
    await expect(fixStaleIndex("")).rejects.toThrow(FixValidationError);
  });

  it("returns no-op when slug is not in the index", async () => {
    mockedListWikiPages.mockResolvedValue([
      { slug: "other", title: "Other", summary: "..." },
    ]);

    const result = await fixStaleIndex("ghost");

    expect(result).toEqual({
      success: true,
      slug: "ghost",
      message: "Entry for ghost not found in index — no changes needed",
    });

    // Should not have called updateIndex or appendToLog
    expect(mockedUpdateIndex).not.toHaveBeenCalled();
    expect(mockedAppendToLog).not.toHaveBeenCalled();
  });

  it("removes stale entry from index", async () => {
    mockedListWikiPages.mockResolvedValue([
      { slug: "good", title: "Good", summary: "keep" },
      { slug: "ghost", title: "Ghost", summary: "remove" },
    ]);

    const result = await fixStaleIndex("ghost");

    expect(result).toEqual({
      success: true,
      slug: "ghost",
      message: "Removed stale entry for ghost from index",
    });

    expect(mockedUpdateIndex).toHaveBeenCalledOnce();
    const updatedEntries = mockedUpdateIndex.mock.calls[0][0];
    expect(updatedEntries).toHaveLength(1);
    expect(updatedEntries[0].slug).toBe("good");

    expect(mockedAppendToLog).toHaveBeenCalledOnce();
    expect(mockedAppendToLog).toHaveBeenCalledWith(
      "edit",
      "ghost",
      "auto-fix: removed stale index entry for ghost",
    );
  });
});

// ---------------------------------------------------------------------------
// fixEmptyPage
// ---------------------------------------------------------------------------

describe("fixEmptyPage", () => {
  it("throws FixValidationError when slug is empty", async () => {
    await expect(fixEmptyPage("")).rejects.toThrow(FixValidationError);
  });

  it("delegates to deleteWikiPage", async () => {
    const result = await fixEmptyPage("empty");

    expect(result).toEqual({
      success: true,
      slug: "empty",
      message: "Deleted empty page empty",
    });

    expect(mockedDeleteWikiPage).toHaveBeenCalledOnce();
    expect(mockedDeleteWikiPage).toHaveBeenCalledWith("empty");
  });
});

// ---------------------------------------------------------------------------
// fixMissingCrossRef
// ---------------------------------------------------------------------------

describe("fixMissingCrossRef", () => {
  it("throws FixValidationError when slug is missing", async () => {
    await expect(fixMissingCrossRef("", "target")).rejects.toThrow(
      FixValidationError,
    );
    await expect(fixMissingCrossRef("", "target")).rejects.toThrow(
      "Missing required fields: slug and targetSlug",
    );
  });

  it("throws FixValidationError when targetSlug is missing", async () => {
    await expect(fixMissingCrossRef("source", "")).rejects.toThrow(
      FixValidationError,
    );
  });

  it("throws FixNotFoundError when source page not found", async () => {
    mockedReadWikiPage.mockResolvedValue(null);

    await expect(fixMissingCrossRef("source", "target")).rejects.toThrow(
      FixNotFoundError,
    );
    await expect(fixMissingCrossRef("source", "target")).rejects.toThrow(
      "Source page not found: source",
    );
  });

  it("throws FixNotFoundError when target page not found", async () => {
    // Mock returns source page first, then null for target — twice for the
    // two expect() calls that each invoke fixMissingCrossRef.
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content: "# Source\n\nContent.",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content: "# Source\n\nContent.",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce(null);

    await expect(fixMissingCrossRef("source", "target")).rejects.toThrow(
      FixNotFoundError,
    );
    await expect(fixMissingCrossRef("source", "target")).rejects.toThrow(
      "Target page not found: target",
    );
  });

  it("returns no-op when link already exists", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content: "# Source\n\nSee [Target](target.md).",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce({
        slug: "target",
        title: "Target",
        content: "# Target\n\nTarget content.",
        path: "/wiki/target.md",
      });

    const result = await fixMissingCrossRef("source", "target");

    expect(result).toEqual({
      success: true,
      slug: "source",
      message: "Page already links to target.md — no changes needed",
    });

    expect(mockedWriteWikiPageWithSideEffects).not.toHaveBeenCalled();
  });

  it("inserts link into existing Related section", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content:
          "# Source\n\nSome content.\n\n## Related\n\n- [Other](other.md)\n",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce({
        slug: "target",
        title: "Target Page",
        content: "# Target Page\n\nTarget content.",
        path: "/wiki/target.md",
      });

    const result = await fixMissingCrossRef("source", "target");

    expect(result.success).toBe(true);
    expect(result.message).toBe(
      "Added cross-reference from source.md to target.md",
    );

    const call = mockedWriteWikiPageWithSideEffects.mock.calls[0][0];
    expect(call.content).toContain("- [Target Page](target.md)");
    expect(call.content).toContain("- [Other](other.md)");
    expect(call.crossRefSource).toBeNull();
  });

  it("creates new Related section when none exists", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content: "# Source\n\nSome content here.",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce({
        slug: "target",
        title: "Target Page",
        content: "# Target Page\n\nTarget content.",
        path: "/wiki/target.md",
      });

    const result = await fixMissingCrossRef("source", "target");

    expect(result.success).toBe(true);

    const call = mockedWriteWikiPageWithSideEffects.mock.calls[0][0];
    expect(call.content).toContain("## Related\n\n- [Target Page](target.md)");
  });
});

// ---------------------------------------------------------------------------
// fixContradiction
// ---------------------------------------------------------------------------

describe("fixContradiction", () => {
  it("throws FixValidationError when slug is empty", async () => {
    await expect(fixContradiction("", "target", "msg")).rejects.toThrow(
      FixValidationError,
    );
    await expect(fixContradiction("", "target", "msg")).rejects.toThrow(
      "Missing required fields: slug and targetSlug",
    );
  });

  it("throws FixValidationError when targetSlug is empty", async () => {
    await expect(fixContradiction("source", "", "msg")).rejects.toThrow(
      FixValidationError,
    );
    await expect(fixContradiction("source", "", "msg")).rejects.toThrow(
      "Missing required fields: slug and targetSlug",
    );
  });

  it("throws FixNotFoundError when source page does not exist", async () => {
    mockedReadWikiPage.mockResolvedValue(null);

    await expect(
      fixContradiction("no-such", "other", "msg"),
    ).rejects.toThrow(FixNotFoundError);
    await expect(
      fixContradiction("no-such", "other", "msg"),
    ).rejects.toThrow("Source page not found: no-such");
  });

  it("throws FixNotFoundError when target page does not exist", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "source",
        title: "Source",
        content: "# Source\n\nContent.",
        path: "/wiki/source.md",
      })
      .mockResolvedValueOnce(null);

    await expect(
      fixContradiction("source", "missing-target", "msg"),
    ).rejects.toThrow(FixNotFoundError);
  });

  it("calls LLM with both pages' content and the contradiction description", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "page-a",
        title: "Page A",
        content: "# Page A\n\nClaims X is true.",
        path: "/wiki/page-a.md",
      })
      .mockResolvedValueOnce({
        slug: "page-b",
        title: "Page B",
        content: "# Page B\n\nClaims X is false.",
        path: "/wiki/page-b.md",
      });

    mockedCallLLM.mockResolvedValue("# Page A\n\nRevised: X is false.");

    const msg = "Contradiction between page-a, page-b: X is debated";
    await fixContradiction("page-a", "page-b", msg);

    expect(mockedCallLLM).toHaveBeenCalledOnce();

    const [systemPrompt, userMessage] = mockedCallLLM.mock.calls[0];
    expect(systemPrompt).toContain("resolving contradictions");
    expect(userMessage).toContain("# Page A");
    expect(userMessage).toContain("# Page B");
    expect(userMessage).toContain(msg);
  });

  it("writes the rewritten page via lifecycle pipeline", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "page-a",
        title: "Page A",
        content: "# Page A\n\nClaims X is true.",
        path: "/wiki/page-a.md",
      })
      .mockResolvedValueOnce({
        slug: "page-b",
        title: "Page B",
        content: "# Page B\n\nClaims X is false.",
        path: "/wiki/page-b.md",
      });

    mockedCallLLM.mockResolvedValue("# Page A\n\nRevised: X is false.");

    const result = await fixContradiction(
      "page-a",
      "page-b",
      "Contradiction between page-a, page-b: conflict",
    );

    expect(result).toEqual({
      success: true,
      slug: "page-a",
      message: "Rewrote page-a.md to resolve contradiction with page-b.md",
    });

    expect(mockedWriteWikiPageWithSideEffects).toHaveBeenCalledOnce();
    const call = mockedWriteWikiPageWithSideEffects.mock.calls[0][0];
    expect(call.slug).toBe("page-a");
    expect(call.content).toBe("# Page A\n\nRevised: X is false.");
    expect(call.logOp).toBe("edit");
  });
});

// ---------------------------------------------------------------------------
// fixLintIssue — dispatcher
// ---------------------------------------------------------------------------

describe("fixLintIssue", () => {
  it("dispatches orphan-page to fixOrphanPage", async () => {
    mockedReadWikiPage.mockResolvedValue({
      slug: "orphan",
      title: "Orphan",
      content: "# Orphan\n\nContent.",
      path: "/wiki/orphan.md",
    });

    const result = await fixLintIssue("orphan-page", "orphan");
    expect(result.slug).toBe("orphan");
    expect(mockedWriteWikiPageWithSideEffects).toHaveBeenCalledOnce();
  });

  it("dispatches stale-index to fixStaleIndex", async () => {
    mockedListWikiPages.mockResolvedValue([
      { slug: "stale", title: "Stale", summary: "..." },
    ]);

    const result = await fixLintIssue("stale-index", "stale");
    expect(result.slug).toBe("stale");
    expect(mockedUpdateIndex).toHaveBeenCalledOnce();
  });

  it("dispatches empty-page to fixEmptyPage", async () => {
    const result = await fixLintIssue("empty-page", "empty");
    expect(result.slug).toBe("empty");
    expect(mockedDeleteWikiPage).toHaveBeenCalledOnce();
  });

  it("dispatches missing-crossref to fixMissingCrossRef", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "src",
        title: "Src",
        content: "# Src\n\nContent.",
        path: "/wiki/src.md",
      })
      .mockResolvedValueOnce({
        slug: "tgt",
        title: "Tgt",
        content: "# Tgt\n\nContent.",
        path: "/wiki/tgt.md",
      });

    const result = await fixLintIssue("missing-crossref", "src", "tgt");
    expect(result.slug).toBe("src");
    expect(mockedWriteWikiPageWithSideEffects).toHaveBeenCalledOnce();
  });

  it("dispatches contradiction to fixContradiction", async () => {
    mockedReadWikiPage
      .mockResolvedValueOnce({
        slug: "alpha",
        title: "Alpha",
        content: "# Alpha\n\nClaim A.",
        path: "/wiki/alpha.md",
      })
      .mockResolvedValueOnce({
        slug: "beta",
        title: "Beta",
        content: "# Beta\n\nClaim B.",
        path: "/wiki/beta.md",
      });

    mockedCallLLM.mockResolvedValue("# Alpha\n\nResolved claim.");

    const msg = "Contradiction between alpha, beta: conflicting claims";
    const result = await fixLintIssue("contradiction", "alpha", "beta", msg);
    expect(result.slug).toBe("alpha");
    expect(mockedCallLLM).toHaveBeenCalledOnce();
    expect(mockedWriteWikiPageWithSideEffects).toHaveBeenCalledOnce();
  });

  it("throws FixValidationError for unknown issue type", async () => {
    await expect(fixLintIssue("banana", "slug")).rejects.toThrow(
      FixValidationError,
    );
    await expect(fixLintIssue("banana", "slug")).rejects.toThrow(
      "Auto-fix not supported for this issue type",
    );
  });
});
