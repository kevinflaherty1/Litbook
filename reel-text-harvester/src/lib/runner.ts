import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import { AbortedError, processItem, RateLimitError, SessionError, type MediaBridge } from "./pipeline";
import { ensureModel, MODEL_SIZE_MB } from "./speech";
import type { JobStore } from "./store";

const KEEP_AWAKE_TAG = "harvest-runner";
/** Pause between posts so the session looks like a person browsing, not a scraper. */
const MIN_GAP_MS = 2500;
const MAX_GAP_MS = 5000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Processes one job at a time; other started jobs wait their turn. */
export class JobRunner {
  private queue: string[] = [];
  private active: { jobId: string; controller: AbortController } | null = null;

  constructor(
    private store: JobStore,
    private bridge: MediaBridge,
  ) {}

  isActive(jobId: string): boolean {
    return this.active?.jobId === jobId;
  }

  start(jobId: string): void {
    if (this.isActive(jobId) || this.queue.includes(jobId)) return;
    this.queue.push(jobId);
    this.store.update(jobId, { state: this.active ? "idle" : "running", note: this.active ? "Waiting for another job" : undefined });
    void this.pump();
  }

  pause(jobId: string, note = "Paused"): void {
    this.queue = this.queue.filter((id) => id !== jobId);
    if (this.active?.jobId === jobId) this.active.controller.abort();
    this.store.update(jobId, { state: "paused", note });
  }

  retryFailed(jobId: string): void {
    const job = this.store.get(jobId);
    if (!job) return;
    this.store.put({
      ...job,
      items: job.items.map((i) => (i.status === "failed" ? { ...i, status: "queued", error: undefined } : i)),
    });
    this.start(jobId);
  }

  private async pump(): Promise<void> {
    if (this.active) return;
    const jobId = this.queue.shift();
    if (!jobId) return;
    const controller = new AbortController();
    this.active = { jobId, controller };
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    try {
      await this.run(jobId, controller.signal);
    } finally {
      this.active = null;
      if (!this.queue.length) void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      void this.pump();
    }
  }

  private async run(jobId: string, signal: AbortSignal): Promise<void> {
    const job = this.store.get(jobId);
    if (!job) return;
    this.store.update(jobId, { state: "running", note: undefined });

    if (job.options.speech) {
      try {
        this.store.update(jobId, { note: `Downloading speech model (~${MODEL_SIZE_MB} MB, once)…` });
        await ensureModel();
        this.store.update(jobId, { note: undefined });
      } catch (e) {
        this.store.update(jobId, { state: "paused", note: `Speech model download failed: ${errorText(e)}` });
        return;
      }
    }

    let first = true;
    for (;;) {
      if (signal.aborted) return;
      const current = this.store.get(jobId);
      const index = current?.items.findIndex((i) => i.status === "queued") ?? -1;
      if (!current || index < 0) break;
      if (!first) await sleep(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS), signal);
      if (signal.aborted) return;
      first = false;

      const item = current.items[index];
      this.store.updateItem(jobId, index, { status: "working", error: undefined });
      try {
        const result = await processItem(item.shortcode, current.options, this.bridge, signal, (stage, progress) =>
          this.store.updateItem(jobId, index, { stage, progress }),
        );
        const { empty, ...fields } = result;
        this.store.updateItem(jobId, index, {
          ...fields,
          status: empty ? "skipped" : "done",
          error: empty ? "No video or image found in this post" : undefined,
          stage: undefined,
          progress: undefined,
        });
      } catch (e) {
        const back = { status: "queued" as const, stage: undefined, progress: undefined };
        if (e instanceof AbortedError) {
          this.store.updateItem(jobId, index, back);
          return;
        }
        if (e instanceof SessionError || e instanceof RateLimitError) {
          this.store.updateItem(jobId, index, back);
          this.store.update(jobId, { state: "paused", note: e.message });
          return;
        }
        this.store.updateItem(jobId, index, {
          status: "failed",
          error: errorText(e),
          stage: undefined,
          progress: undefined,
        });
      }
    }
    this.store.update(jobId, { state: "done", note: undefined });
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
