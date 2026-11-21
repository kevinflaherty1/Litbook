import { describe, expect, it } from "vitest";
import { frameTimesMs } from "./frameSchedule";

describe("frameTimesMs", () => {
  it("samples once per second by default", () => {
    expect(frameTimesMs(5)).toEqual([300, 1300, 2300, 3300, 4300]);
  });

  it("honours fps", () => {
    expect(frameTimesMs(2, { fps: 2 })).toEqual([300, 800, 1300, 1800]);
  });

  it("spreads frames evenly when over the cap", () => {
    const times = frameTimesMs(600, { maxFrames: 10 });
    expect(times).toHaveLength(10);
    expect(times[0]).toBe(300);
    expect(times[9]).toBe(599900);
  });

  it("handles very short and unknown durations", () => {
    expect(frameTimesMs(0.2)).toEqual([100]);
    expect(frameTimesMs(null)).toHaveLength(90);
  });

  it("never exceeds the end of the video", () => {
    for (const d of [0.5, 1, 7.25, 59.9]) {
      for (const t of frameTimesMs(d)) expect(t).toBeLessThan(d * 1000);
    }
  });
});
