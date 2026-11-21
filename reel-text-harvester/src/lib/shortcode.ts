// Instagram post/reel identifiers.
//
// A post's public URL carries a "shortcode" (e.g. /reel/C9xYz.../). The private
// web API wants the numeric media id ("pk"). The shortcode is that id written in
// base64 with Instagram's URL-safe alphabet, so the conversion is local.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Matches /p/CODE, /reel/CODE, /reels/CODE, /tv/CODE, with or without a
// leading /<username>/ segment, on absolute or relative hrefs.
const POST_PATH = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;

// Shortcodes of posts from private accounts carry a long suffix after the
// 11-character id part; only the id part encodes the media id.
const ID_PART_MAX = 11;

export function extractShortcode(href: string): string | null {
  const match = POST_PATH.exec(href);
  return match ? match[1] : null;
}

export function shortcodeToMediaId(shortcode: string): string {
  const idPart = shortcode.length > ID_PART_MAX ? shortcode.slice(0, ID_PART_MAX) : shortcode;
  const base = BigInt(64);
  let id = BigInt(0);
  for (const ch of idPart) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`Invalid shortcode character "${ch}" in ${shortcode}`);
    id = id * base + BigInt(digit);
  }
  return id.toString();
}

export function mediaIdToShortcode(mediaId: string): string {
  const base = BigInt(64);
  let id = BigInt(mediaId);
  if (id === BigInt(0)) return ALPHABET[0];
  let out = "";
  while (id > BigInt(0)) {
    out = ALPHABET[Number(id % base)] + out;
    id = id / base;
  }
  return out;
}

export function postUrl(shortcode: string): string {
  return `https://www.instagram.com/p/${shortcode}/`;
}

export type CollectionRef = {
  /** Slug from the URL, e.g. "recipes" or "all-posts". */
  slug: string;
  /** Numeric collection id when the URL has one. */
  id: string | null;
  /** Human-readable name derived from the slug. */
  name: string;
  url: string;
};

// Saved collections live at /<username>/saved/<slug>/<id>/ ; the "All posts"
// view is /<username>/saved/all-posts/.
const COLLECTION_PATH = /^\/[^/]+\/saved\/([^/]+)\/?(\d+)?\/?$/;

export function parseCollectionUrl(url: string): CollectionRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/.test(parsed.hostname)) return null;
  const match = COLLECTION_PATH.exec(parsed.pathname);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  const name = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return { slug, id: match[2] ?? null, name: name || slug, url: parsed.origin + parsed.pathname };
}

/** Unique shortcodes, first occurrence wins, order kept. */
export function uniqueShortcodes(hrefs: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of hrefs) {
    const code = extractShortcode(href);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
