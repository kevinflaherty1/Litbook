export type FrameScheduleOptions = {
  /** Frames sampled per second of video. */
  fps: number;
  /** Upper bound on frames per video; long videos are sampled evenly instead. */
  maxFrames: number;
  /** Skip the very first instant, which is often a black or fade-in frame. */
  startOffsetMs: number;
};

export const DEFAULT_FRAME_SCHEDULE: FrameScheduleOptions = {
  fps: 1,
  maxFrames: 120,
  startOffsetMs: 300,
};

/** Duration assumed when Instagram did not report one (Reels are capped at a few minutes). */
const UNKNOWN_DURATION_SEC = 90;

/**
 * Timestamps (ms) at which to grab frames. Frames are spaced 1/fps apart and
 * never land in the final 100 ms, where some decoders return no frame.
 */
export function frameTimesMs(
  durationSec: number | null,
  options: Partial<FrameScheduleOptions> = {},
): number[] {
  const { fps, maxFrames, startOffsetMs } = { ...DEFAULT_FRAME_SCHEDULE, ...options };
  if (fps <= 0 || maxFrames <= 0) return [];
  const durationMs = Math.max(0, (durationSec ?? UNKNOWN_DURATION_SEC) * 1000);
  const endMs = durationMs - 100;
  const start = Math.min(startOffsetMs, Math.max(0, endMs));
  if (endMs <= start) return [Math.max(0, Math.floor(durationMs / 2))];

  const span = endMs - start;
  const wanted = Math.floor((span / 1000) * fps) + 1;
  const count = Math.min(wanted, maxFrames);
  if (count === 1) return [Math.round(start)];
  // Exactly 1/fps apart when that fits under the cap, otherwise spread evenly.
  const step = wanted <= maxFrames ? 1000 / fps : span / (count - 1);
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(Math.round(start + i * step));
  return times;
}
