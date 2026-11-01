import type { TextEntities } from "./types.ts";

const HASHTAG = /(?:^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]*[\p{L}_][\p{L}\p{N}_]*)/gu;
const MENTION = /(?:^|[^\p{L}\p{N}_.@])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?)/gu;
const REDDIT_USER = /(?:^|[^\w/])\/?u\/([A-Za-z0-9_-]{3,20})/g;
const URL = /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/** Pull hashtags, mentions and links out of free text. */
export function extractEntities(text: string): TextEntities {
  const urls = [...text.matchAll(URL)].map((m) => m[0]);
  // Don't treat `#fragment` or `@` inside a URL as entities.
  const withoutUrls = text.replace(URL, " ");
  const hashtags = [...withoutUrls.matchAll(HASHTAG)].map((m) => m[1]!);
  const mentions = [
    ...[...withoutUrls.matchAll(MENTION)].map((m) => m[1]!),
    ...[...withoutUrls.matchAll(REDDIT_USER)].map((m) => m[1]!),
  ];
  return { hashtags: unique(hashtags), mentions: unique(mentions), urls: unique(urls) };
}

export function emptyEntities(): TextEntities {
  return { hashtags: [], mentions: [], urls: [] };
}

/**
 * Instagram/Facebook exports write UTF-8 bytes as if each byte were a Latin-1
 * code point ("â\u0080\u0099" instead of "’"). Re-decode when the string looks
 * like that; leave genuine text alone.
 */
export function fixMetaMojibake(value: string): string {
  if (!/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

/** Twitter's export HTML-escapes text; undo the handful of entities it uses. */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function toIso(input: string | number | Date): string {
  const date =
    typeof input === "number"
      ? new Date(input < 1e12 ? input * 1000 : input) // seconds vs millis
      : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error(`Unparseable date: ${String(input)}`);
  return date.toISOString();
}
