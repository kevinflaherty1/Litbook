import { describe, expect, it } from "vitest";
import { filterByRegion, normalize, OcrAccumulator, similarity } from "./textMerge";

describe("normalize/similarity", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(normalize("  Crème BRÛLÉE!!  — 5 min ")).toBe("creme brulee 5 min");
  });
  it("scores near-identical OCR reads high", () => {
    expect(similarity("preheat to 200c", "preheat t0 200c")).toBeGreaterThan(0.9);
    expect(similarity("preheat to 200c", "add the garlic")).toBeLessThan(0.5);
  });
});

describe("OcrAccumulator", () => {
  it("folds repeated captions and keeps the most common reading", () => {
    const acc = new OcrAccumulator();
    acc.add(0, 0, ["Preheat to 200C"]);
    acc.add(0, 1, ["Preheat t0 200C"]);
    acc.add(0, 2, ["Preheat to 200C", "Add the garlic"]);
    acc.add(0, 3, ["Add the garlic"]);
    expect(acc.result()).toEqual([
      { text: "Preheat to 200C", part: 0, firstSeenSec: 0, lastSeenSec: 2, frames: 3 },
      { text: "Add the garlic", part: 0, firstSeenSec: 2, lastSeenSec: 3, frames: 2 },
    ]);
  });

  it("merges type-on captions into their full form", () => {
    const acc = new OcrAccumulator();
    acc.add(0, 0, ["Step 1"]);
    acc.add(0, 1, ["Step 1: boil"]);
    acc.add(0, 2, ["Step 1: boil the pasta"]);
    acc.add(0, 3, ["Step 1: boil the pasta"]);
    expect(acc.result().map((l) => l.text)).toEqual(["Step 1: boil the pasta"]);
  });

  it("keeps two genuinely different lines in the same frame apart", () => {
    const acc = new OcrAccumulator();
    acc.add(0, 0, ["1 cup flour", "1 cup sugar"]);
    acc.add(0, 1, ["1 cup flour", "1 cup sugar"]);
    expect(acc.result().map((l) => [l.text, l.frames])).toEqual([
      ["1 cup flour", 2],
      ["1 cup sugar", 2],
    ]);
  });

  it("drops noise and keeps carousel parts separate", () => {
    const acc = new OcrAccumulator();
    acc.add(0, 0, ["|", " • ", "Hello"]);
    acc.add(1, 0, ["Hello"]);
    expect(acc.result().map((l) => [l.part, l.text])).toEqual([
      [0, "Hello"],
      [1, "Hello"],
    ]);
  });
});

describe("filterByRegion", () => {
  const line = (text: string, cx: number, cy: number) => ({
    text,
    frame: { left: cx - 5, top: cy - 5, width: 10, height: 10 },
  });
  it("drops lines centred in ignored margins", () => {
    const lines = [line("watermark", 50, 990), line("caption", 360, 640), line("no box", 0, 0)];
    lines[2] = { text: "no box" } as never;
    const kept = filterByRegion(lines, 720, 1000, { top: 0, bottom: 0.05, left: 0, right: 0 });
    expect(kept.map((l) => l.text)).toEqual(["caption", "no box"]);
  });
  it("is a no-op with zero margins", () => {
    const lines = [line("a", 1, 1)];
    expect(filterByRegion(lines, 720, 1280, { top: 0, bottom: 0, left: 0, right: 0 })).toBe(lines);
  });
});
