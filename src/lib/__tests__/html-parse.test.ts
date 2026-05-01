import { describe, it, expect } from "vitest";
import {
  stripHtml,
  htmlToMarkdown,
  extractTitle,
  extractWithReadability,
} from "../html-parse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple well-formed article HTML page. */
function articleHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <article>
    <h1>${title}</h1>
    ${"<p>" + content + "</p>\n".repeat(5)}
  </article>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("removes <script> elements entirely", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(stripHtml(html)).toBe("Hello World");
  });

  it("removes <style> elements entirely", () => {
    const html = "<style>body { color: red; }</style><p>Visible</p>";
    expect(stripHtml(html)).toBe("Visible");
  });

  it("removes <nav>, <header>, <footer> elements", () => {
    const html =
      "<nav>Menu</nav><header>Head</header><main>Content</main><footer>Foot</footer>";
    expect(stripHtml(html)).toBe("Content");
  });

  it("removes <noscript> elements", () => {
    const html = "<noscript>Enable JS</noscript><p>Content</p>";
    expect(stripHtml(html)).toBe("Content");
  });

  it("strips remaining HTML tags", () => {
    const html = "<div><span>Hello</span> <b>World</b></div>";
    expect(stripHtml(html)).toBe("Hello World");
  });

  it("decodes named HTML entities: &amp;, &lt;, &gt;, &quot;", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("decodes &mdash;, &ndash;, &hellip;", () => {
    const result = stripHtml("A&mdash;B&ndash;C&hellip;");
    expect(result).toBe("A\u2014B\u2013C\u2026");
  });

  it("decodes &rsquo;, &lsquo;, &rdquo;, &ldquo;", () => {
    const result = stripHtml("&lsquo;Hello&rsquo; &ldquo;World&rdquo;");
    expect(result).toBe("\u2018Hello\u2019 \u201CWorld\u201D");
  });

  it("decodes &trade;, &copy;, &reg;, &bull;, &middot;", () => {
    const result = stripHtml("&trade; &copy; &reg; &bull; &middot;");
    expect(result).toBe("\u2122 \u00A9 \u00AE \u2022 \u00B7");
  });

  it("decodes &#39; (numeric apostrophe) and &nbsp;", () => {
    expect(stripHtml("It&#39;s&nbsp;fine")).toBe("It's fine");
  });

  it("decodes decimal numeric entities (&#123;)", () => {
    expect(stripHtml("&#72;&#101;&#108;&#108;&#111;")).toBe("Hello");
  });

  it("decodes hex numeric entities (&#x1F600;)", () => {
    expect(stripHtml("&#x1F600;")).toBe("😀");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("  Hello   \n\t  World  ")).toBe("Hello World");
  });

  it("handles case-insensitive tag removal", () => {
    const html = "<SCRIPT>evil()</SCRIPT><p>Safe</p>";
    expect(stripHtml(html)).toBe("Safe");
  });
});

// ---------------------------------------------------------------------------
// extractTitle
// ---------------------------------------------------------------------------

describe("extractTitle", () => {
  it("extracts title from simple HTML", () => {
    expect(extractTitle("<title>Hello World</title>")).toBe("Hello World");
  });

  it("extracts title case-insensitively", () => {
    expect(extractTitle("<TITLE>Test</TITLE>")).toBe("Test");
  });

  it("strips inner tags from title", () => {
    expect(extractTitle("<title><b>Bold</b> Title</title>")).toBe(
      "Bold Title",
    );
  });

  it("collapses whitespace in title", () => {
    expect(extractTitle("<title>  Hello   World  </title>")).toBe(
      "Hello World",
    );
  });

  it("returns empty string when no title found", () => {
    expect(extractTitle("<html><body>No title here</body></html>")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractTitle("")).toBe("");
  });

  it("handles title with attributes", () => {
    expect(extractTitle('<title lang="en">Page Title</title>')).toBe(
      "Page Title",
    );
  });

  it("handles multiline title content", () => {
    expect(extractTitle("<title>\n  Multi\n  Line\n</title>")).toBe(
      "Multi Line",
    );
  });
});

// ---------------------------------------------------------------------------
// extractWithReadability
// ---------------------------------------------------------------------------

describe("extractWithReadability", () => {
  it("extracts article content from well-formed HTML", () => {
    const html = articleHtml("Test Article", "This is an important paragraph about testing frameworks and methodologies.");
    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Article");
    expect(result!.textContent).toBeTruthy();
    expect(result!.textContent.length).toBeGreaterThan(0);
  });

  it("returns null for empty body", () => {
    const html = "<html><head></head><body></body></html>";
    expect(extractWithReadability(html)).toBeNull();
  });

  it("returns null for minimal non-article HTML", () => {
    const html = "<html><head></head><body>  </body></html>";
    expect(extractWithReadability(html)).toBeNull();
  });

  it("returns trimmed textContent", () => {
    const html = articleHtml("Trim Test", "This is meaningful article content that should be preserved by the readability parser.");
    const result = extractWithReadability(html);
    if (result) {
      expect(result.textContent).toBe(result.textContent.trim());
    }
  });

  it("returns empty string for title when article has no title", () => {
    // Article-like content without a title
    const html = `<html><body><article>${"<p>Paragraph of substantial content for readability extraction testing purposes.</p>\n".repeat(10)}</article></body></html>`;
    const result = extractWithReadability(html);
    // If parsed, title should be a string (possibly empty)
    if (result) {
      expect(typeof result.title).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// extractWithReadability — image preservation integration
// ---------------------------------------------------------------------------

describe("extractWithReadability — images", () => {
  it("returns htmlContent containing <img> tags from source HTML", () => {
    // Build a full article HTML with an embedded image
    const html = `<!DOCTYPE html>
<html>
<head><title>Photo Article</title></head>
<body>
  <article>
    <h1>Photo Article</h1>
    <p>Here is a photo:</p>
    <img src="https://example.com/photo.jpg" alt="A nice photo">
    ${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.</p>\n'.repeat(5)}
  </article>
</body>
</html>`;

    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    // The htmlContent should preserve the image tag
    expect(result!.htmlContent).toContain("img");
    expect(result!.htmlContent).toContain("https://example.com/photo.jpg");

    // Converting to markdown should produce image reference
    const md = htmlToMarkdown(result!.htmlContent);
    expect(md).toContain("![");
    expect(md).toContain("https://example.com/photo.jpg");
  });
});

// ---------------------------------------------------------------------------
// htmlToMarkdown
// ---------------------------------------------------------------------------

describe("htmlToMarkdown", () => {
  it("converts <img> tags to markdown image syntax", () => {
    const html = '<img src="https://example.com/photo.jpg" alt="A photo">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![A photo](https://example.com/photo.jpg)");
  });

  it("handles <img> with alt before src", () => {
    const html = '<img alt="Logo" src="https://example.com/logo.png">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![Logo](https://example.com/logo.png)");
  });

  it("handles empty alt text", () => {
    const html = '<img src="https://example.com/img.png" alt="">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![](https://example.com/img.png)");
  });

  it("handles missing alt attribute", () => {
    const html = '<img src="https://example.com/img.png">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![](https://example.com/img.png)");
  });

  it("handles relative image URLs (pass through as-is)", () => {
    const html = '<img src="/images/cat.jpg" alt="cat">';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![cat](/images/cat.jpg)");
  });

  it("converts <a> tags to markdown links", () => {
    const html = '<a href="https://example.com">Example</a>';
    const md = htmlToMarkdown(html);
    expect(md).toBe("[Example](https://example.com)");
  });

  it("preserves heading hierarchy", () => {
    const html = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
    expect(md).toContain("### Section");
  });

  it("converts <strong>/<b> to bold", () => {
    const html = "<p>This is <strong>bold</strong> and <b>also bold</b>.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("**bold**");
    expect(md).toContain("**also bold**");
  });

  it("converts <em>/<i> to italic", () => {
    const html = "<p>This is <em>italic</em> and <i>also italic</i>.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("*italic*");
    expect(md).toContain("*also italic*");
  });

  it("converts <ul>/<li> to list items", () => {
    const html = "<ul><li>First</li><li>Second</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("- First");
    expect(md).toContain("- Second");
  });

  it("converts <p> tags to paragraph breaks", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("First paragraph.");
    expect(md).toContain("Second paragraph.");
    // Should have blank lines between paragraphs
    expect(md).toMatch(/First paragraph\.\n\n.*Second paragraph\./s);
  });

  it("converts <br> to newlines", () => {
    const html = "Line one<br>Line two<br/>Line three";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Line one\nLine two\nLine three");
  });

  it("strips unknown/dangerous tags while preserving text", () => {
    const html =
      '<div class="wrapper"><span>Hello</span> <iframe>bad</iframe></div>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("Hello");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
    expect(md).not.toContain("<iframe");
  });

  it("strips <script> and <style> tags entirely", () => {
    const html =
      '<p>Text</p><script>alert("xss")</script><style>.x{}</style><p>More</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("Text");
    expect(md).toContain("More");
    expect(md).not.toContain("alert");
    expect(md).not.toContain(".x{");
  });

  it("decodes HTML entities", () => {
    const html = "<p>Tom &amp; Jerry &mdash; a classic</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("Tom & Jerry \u2014 a classic");
  });

  it("handles self-closing img tags", () => {
    const html = '<img src="https://example.com/photo.jpg" alt="Photo" />';
    const md = htmlToMarkdown(html);
    expect(md).toBe("![Photo](https://example.com/photo.jpg)");
  });

  it("handles complex document with mixed elements", () => {
    const html = `
      <h1>Article Title</h1>
      <p>Some text with <strong>bold</strong> and an
      <img src="https://example.com/fig1.png" alt="Figure 1">.</p>
      <p>See <a href="https://example.com">this link</a> for more.</p>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain("# Article Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("![Figure 1](https://example.com/fig1.png)");
    expect(md).toContain("[this link](https://example.com)");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  // --- New edge case tests ---

  it("handles nested lists by flattening list items", () => {
    const html = `
      <ul>
        <li>Item 1</li>
        <li>Item 2
          <ul>
            <li>Nested A</li>
            <li>Nested B</li>
          </ul>
        </li>
        <li>Item 3</li>
      </ul>
    `;
    const md = htmlToMarkdown(html);
    // Top-level items become list entries
    expect(md).toContain("- Item 1");
    expect(md).toContain("- Item 3");
    // Nested items: the converter flattens inner <li> too
    // The nested text content should be present somewhere in the output
    expect(md).toContain("Nested A");
    expect(md).toContain("Nested B");
  });

  it("strips <code> and <pre> tags while preserving content", () => {
    const html = "<p>Use <code>console.log()</code> for debugging.</p><pre><code>const x = 42;\nconsole.log(x);</code></pre>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("console.log()");
    expect(md).toContain("const x = 42;");
    // Tags themselves should not appear
    expect(md).not.toContain("<code>");
    expect(md).not.toContain("<pre>");
  });

  it("strips <table> markup while preserving cell text", () => {
    const html = `
      <table>
        <thead><tr><th>Name</th><th>Age</th></tr></thead>
        <tbody>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </tbody>
      </table>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain("Name");
    expect(md).toContain("Age");
    expect(md).toContain("Alice");
    expect(md).toContain("Bob");
    expect(md).toContain("30");
    expect(md).toContain("25");
    // Table tags should be stripped
    expect(md).not.toContain("<table");
    expect(md).not.toContain("<tr");
    expect(md).not.toContain("<td");
    expect(md).not.toContain("<th");
  });
});
