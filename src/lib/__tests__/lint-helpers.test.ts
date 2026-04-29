import { describe, it, expect } from "vitest";
import { fixKey } from "@/hooks/useLint";
import type { LintIssue } from "@/lib/types";

/** Helper to build a minimal LintIssue for testing. */
function issue(
  overrides: Partial<LintIssue> & Pick<LintIssue, "type" | "slug">,
): LintIssue {
  return {
    message: "test message",
    severity: "warning",
    ...overrides,
  };
}

describe("fixKey", () => {
  it('orphan-page issue → "orphan-page:<slug>"', () => {
    expect(fixKey(issue({ type: "orphan-page", slug: "foo" }))).toBe(
      "orphan-page:foo",
    );
  });

  it('stale-index issue → "stale-index:<slug>"', () => {
    expect(fixKey(issue({ type: "stale-index", slug: "bar" }))).toBe(
      "stale-index:bar",
    );
  });

  it('empty-page issue → "empty-page:<slug>"', () => {
    expect(fixKey(issue({ type: "empty-page", slug: "baz" }))).toBe(
      "empty-page:baz",
    );
  });

  it('missing-crossref with target → "missing-crossref:<slug>:<target>"', () => {
    expect(
      fixKey(
        issue({ type: "missing-crossref", slug: "a", target: "b" }),
      ),
    ).toBe("missing-crossref:a:b");
  });

  it('missing-crossref without target → "missing-crossref:<slug>"', () => {
    expect(
      fixKey(issue({ type: "missing-crossref", slug: "a" })),
    ).toBe("missing-crossref:a");
  });

  it('contradiction with target → "contradiction:<slug>:<target>"', () => {
    expect(
      fixKey(
        issue({ type: "contradiction", slug: "x", target: "y" }),
      ),
    ).toBe("contradiction:x:y");
  });

  it('broken-link with target → "broken-link:<slug>:<target>"', () => {
    expect(
      fixKey(
        issue({ type: "broken-link", slug: "page1", target: "page2" }),
      ),
    ).toBe("broken-link:page1:page2");
  });

  it('missing-concept-page → "missing-concept-page:<message>"', () => {
    expect(
      fixKey(
        issue({
          type: "missing-concept-page",
          slug: "index",
          message: "Neural networks",
        }),
      ),
    ).toBe("missing-concept-page:Neural networks");
  });

  it("contradiction without target falls back to slug-based key", () => {
    expect(
      fixKey(issue({ type: "contradiction", slug: "solo" })),
    ).toBe("contradiction:solo");
  });

  it("broken-link without target falls back to slug-based key", () => {
    expect(
      fixKey(issue({ type: "broken-link", slug: "orphan" })),
    ).toBe("broken-link:orphan");
  });
});
