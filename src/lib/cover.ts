/**
 * Pure helpers for the generated, render-free card covers on a user's profile
 * blog index (see `ProfileBlogIndex`). A cover is a deterministic gradient keyed
 * off the page slug plus a 1–2 letter monogram from the title — no screenshots
 * or live iframes, so the listing stays cheap.
 */

/** A deterministic cover gradient for a seed (e.g. a page slug). Same seed always
 *  yields the same warm, low-saturation two-stop gradient. */
export function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  return `linear-gradient(135deg, hsl(${hue} 52% 64%), hsl(${hue2} 48% 52%))`;
}

/** A 1–2 letter monogram from a title's leading words. */
export function monogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "·";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
