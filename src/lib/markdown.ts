/**
 * Small, pure markdown text helpers shared across render surfaces.
 */

/**
 * Strip a body's own leading `# Title` (an ATX H1) so a caller that renders the
 * title separately (from frontmatter) doesn't show it twice. Anchored to the
 * START of the body — only a genuine leading title is removed, NOT a `# ` that
 * appears later as a section heading. `##`/`###` and `#no-space` are left alone.
 */
export function stripLeadingH1(body: string): string {
  return body.replace(/^\s*#[ \t]+.+(?:\r?\n)?/, "");
}
