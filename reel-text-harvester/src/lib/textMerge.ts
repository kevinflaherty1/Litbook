// Turn per-frame OCR output into one clean, ordered list of on-screen text.
//
// A caption burned into a Reel stays on screen for several seconds, so at
// 1 frame/sec the same line is read many times, often with small OCR
// differences ("Preheat t0 200C" vs "Preheat to 200C"), and type-on captions
// grow frame by frame ("Step 1" -> "Step 1: preheat"). The accumulator folds
// those repeats into a single line and keeps the reading that occurred most.

export type Box = { left: number; top: number; width: number; height: number };

export type OcrLineInput = { text: string; frame?: Box };

/** Fractions of the frame to ignore on each side (0 = keep everything). */
export type Margins = { top: number; bottom: number; left: number; right: number };

export const NO_MARGINS: Margins = { top: 0, bottom: 0, left: 0, right: 0 };

export type MergedLine = {
  text: string;
  /** Media part (carousel slide) the line came from; 0 for single videos/images. */
  part: number;
  firstSeenSec: number;
  lastSeenSec: number;
  /** Number of frames the line was read in. */
  frames: number;
};

/**
 * Drop lines whose centre falls inside the ignored margins. Downloaded media
 * contains no Instagram UI, so this is for creator watermarks and platform
 * logos (e.g. a re-posted TikTok handle in a corner), not app buttons.
 */
export function filterByRegion(
  lines: OcrLineInput[],
  imageWidth: number,
  imageHeight: number,
  margins: Margins,
): OcrLineInput[] {
  if (!imageWidth || !imageHeight) return lines;
  const { top, bottom, left, right } = margins;
  if (!top && !bottom && !left && !right) return lines;
  return lines.filter(({ frame }) => {
    if (!frame) return true;
    const cx = (frame.left + frame.width / 2) / imageWidth;
    const cy = (frame.top + frame.height / 2) / imageHeight;
    return cx >= left && cx <= 1 - right && cy >= top && cy <= 1 - bottom;
  });
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

const SIMILAR = 0.8;
/** A shorter reading counts as the same line growing if it is at least this share of the longer one. */
const PREFIX_SHARE = 0.4;
/** Lines need this many letters/digits to count (drops stray "|" and "•" reads). */
const MIN_CHARS = 2;

function sameLine(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && short.length >= long.length * PREFIX_SHARE) return true;
  return similarity(a, b) >= SIMILAR;
}

type Entry = {
  part: number;
  norm: string;
  variants: Map<string, number>;
  firstSeenSec: number;
  lastSeenSec: number;
  frames: number;
  order: number;
};

export class OcrAccumulator {
  private entries: Entry[] = [];
  private nextOrder = 0;

  add(part: number, timeSec: number, lines: string[]): void {
    const matchedThisFrame = new Set<Entry>();
    for (const raw of lines) {
      const text = raw.replace(/\s+/g, " ").trim();
      const norm = normalize(text);
      if (norm.replace(/ /g, "").length < MIN_CHARS) continue;

      const entry = this.entries.find(
        (e) => e.part === part && !matchedThisFrame.has(e) && sameLine(e.norm, norm),
      );
      if (entry) {
        matchedThisFrame.add(entry);
        entry.variants.set(text, (entry.variants.get(text) ?? 0) + 1);
        if (norm.length > entry.norm.length) entry.norm = norm;
        entry.lastSeenSec = Math.max(entry.lastSeenSec, timeSec);
        entry.frames += 1;
      } else {
        const created: Entry = {
          part,
          norm,
          variants: new Map([[text, 1]]),
          firstSeenSec: timeSec,
          lastSeenSec: timeSec,
          frames: 1,
          order: this.nextOrder++,
        };
        matchedThisFrame.add(created);
        this.entries.push(created);
      }
    }
  }

  result(): MergedLine[] {
    return [...this.entries]
      .sort((a, b) => a.part - b.part || a.firstSeenSec - b.firstSeenSec || a.order - b.order)
      .map((e) => ({
        text: bestVariant(e),
        part: e.part,
        firstSeenSec: e.firstSeenSec,
        lastSeenSec: e.lastSeenSec,
        frames: e.frames,
      }));
  }
}

/** Most frequent reading; ties go to the longest (the fully typed-on caption). */
function bestVariant(entry: Entry): string {
  let best = "";
  let bestCount = -1;
  for (const [text, count] of entry.variants) {
    if (count > bestCount || (count === bestCount && text.length > best.length)) {
      best = text;
      bestCount = count;
    }
  }
  // A growing caption is read in its full form only at the end; prefer that
  // when the frequent reading is a strict prefix of a longer one.
  for (const text of entry.variants.keys()) {
    if (normalize(text) === entry.norm && text.length > best.length && normalize(text).startsWith(normalize(best))) {
      best = text;
    }
  }
  return best;
}
