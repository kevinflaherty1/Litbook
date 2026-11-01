/** Text helpers shared by the transformers. */

/**
 * Split off a trailing "hashtag wall" — the block of tags Instagram users put
 * at the end of a caption. Inline tags inside sentences stay in the body.
 */
export function splitTrailingHashtags(text: string): { body: string; tags: string[] } {
  const lines = text.trimEnd().split("\n");
  const tags: string[] = [];
  while (lines.length) {
    const last = lines.at(-1)!.trim();
    if (last === "" || /^[.·•_-]+$/.test(last)) {
      lines.pop();
      continue;
    }
    // A line made only of #tags (and separators).
    if (/^(?:#[\p{L}\p{N}_]+[\s,]*)+$/u.test(last)) {
      tags.unshift(...[...last.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!));
      lines.pop();
      continue;
    }
    // Trailing tags on the same line as the final sentence: "Sunset! #beach #sky"
    const m = /^(.*?[^\s#])((?:\s+#[\p{L}\p{N}_]+)+)\s*$/u.exec(last);
    if (m && tags.length === 0) {
      tags.unshift(...[...m[2]!.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((x) => x[1]!));
      lines[lines.length - 1] = m[1]!;
    }
    break;
  }
  return { body: lines.join("\n").trimEnd(), tags };
}

/** Reduce Reddit-flavoured markdown to plain text for platforms without markup. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) =>
      label === url ? url : `${label} (${url})`,
    )
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/^>[ \t]?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x200B;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape plain text so Reddit's markdown renders it literally. */
export function plainToMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/^(\s*)#/gm, "$1\\#") // a leading #hashtag would become a heading
    .replace(/^(\s*)>/gm, "$1\\>")
    .replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2\\.$3")
    .replace(/([*_~^`[\]])/g, "\\$1")
    .replace(/(?<!\n)\n(?!\n)/g, "  \n"); // keep single line breaks as breaks
}

const URL = /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g;
const TCO_LENGTH = 23;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function charWeight(codePoint: number): number {
  return codePoint <= 4351 ||
    (codePoint >= 8192 && codePoint <= 8205) ||
    (codePoint >= 8208 && codePoint <= 8223) ||
    (codePoint >= 8242 && codePoint <= 8247)
    ? 1
    : 2;
}

/**
 * Length as X/Twitter counts it (twitter-text v3 weighting): Latin and most
 * punctuation count 1, CJK and most other scripts count 2, an emoji sequence
 * counts 2, and every URL counts 23 regardless of its real length.
 */
export function tweetLength(text: string): number {
  let total = 0;
  let last = 0;
  for (const m of text.matchAll(URL)) {
    total += weightedPlain(text.slice(last, m.index)) + TCO_LENGTH;
    last = m.index + m[0].length;
  }
  return total + weightedPlain(text.slice(last));
}

function weightedPlain(text: string): number {
  let total = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) total += 2;
    else for (const ch of segment) total += charWeight(ch.codePointAt(0)!);
  }
  return total;
}

/** Truncate on a word boundary, adding an ellipsis, so `measure(result) <= max`. */
export function truncate(
  text: string,
  max: number,
  measure: (s: string) => number = (s) => [...s].length,
): string {
  if (measure(text) <= max) return text;
  const words = text.split(/(\s+)/);
  let out = "";
  for (const w of words) {
    if (measure(out + w + "…") > max) break;
    out += w;
  }
  out = out.trimEnd();
  if (!out) {
    // A single word longer than max: cut by grapheme.
    for (const { segment } of segmenter.segment(text)) {
      if (measure(out + segment + "…") > max) break;
      out += segment;
    }
  }
  return out + "…";
}

/** First sentence or line, for synthesizing a title. */
export function firstSentence(text: string): string {
  const line =
    text
      .trim()
      .split("\n")
      .find((l) => l.trim()) ?? "";
  const m = /^(.+?[.!?])(\s|$)/u.exec(line.trim());
  return (m ? m[1]! : line).trim();
}
