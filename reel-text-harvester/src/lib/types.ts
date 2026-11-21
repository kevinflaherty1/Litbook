import type { CollectionRef } from "./shortcode";
import type { Margins, MergedLine } from "./textMerge";

export type ItemStatus = "queued" | "working" | "done" | "failed" | "skipped";
export type ItemStage = "resolving" | "downloading" | "reading frames" | "transcribing";

export type JobItem = {
  shortcode: string;
  status: ItemStatus;
  stage?: ItemStage;
  /** e.g. "frame 12/31" while working. */
  progress?: string;
  error?: string;
  author?: string | null;
  caption?: string | null;
  kinds?: ("video" | "image")[];
  ocr: MergedLine[];
  transcript: string | null;
};

export type JobOptions = {
  fps: number;
  maxFrames: number;
  speech: boolean;
  /** Whisper language code, or "auto". */
  language: string;
  margins: Margins;
};

export type JobState = "idle" | "running" | "paused" | "done";

export type Job = {
  id: string;
  collection: CollectionRef;
  createdAt: number;
  options: JobOptions;
  state: JobState;
  /** Why the job paused, or what it is doing at job level. */
  note?: string;
  items: JobItem[];
};

export function jobCounts(job: Job) {
  const counts = { total: job.items.length, done: 0, failed: 0, skipped: 0, pending: 0 };
  for (const item of job.items) {
    if (item.status === "done") counts.done++;
    else if (item.status === "failed") counts.failed++;
    else if (item.status === "skipped") counts.skipped++;
    else counts.pending++;
  }
  return counts;
}
