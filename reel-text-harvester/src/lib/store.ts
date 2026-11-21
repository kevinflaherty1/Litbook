import { Directory, File, Paths } from "expo-file-system";
import type { Job, JobItem } from "./types";

// Jobs live as one JSON file each under <documents>/jobs/. Everything stays
// on the device; nothing here talks to a server.

const WRITE_DELAY_MS = 400;

export class JobStore {
  private jobs = new Map<string, Job>();
  private snapshot: Job[] = [];
  private listeners = new Set<() => void>();
  private pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private dir = new Directory(Paths.document, "jobs");

  load(): void {
    this.dir.create({ intermediates: true, idempotent: true });
    for (const entry of this.dir.list()) {
      if (!(entry instanceof File) || !entry.name.endsWith(".json")) continue;
      try {
        const job = recoverInterrupted(JSON.parse(entry.textSync()) as Job);
        this.jobs.set(job.id, job);
      } catch {
        // A half-written file from a crash; skip it rather than lose the rest.
      }
    }
    this.emit();
  }

  list = (): Job[] => this.snapshot;

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  put(job: Job): void {
    this.jobs.set(job.id, job);
    this.scheduleWrite(job.id);
    this.emit();
  }

  update(id: string, patch: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const next = { ...job, ...patch };
    this.put(next);
    return next;
  }

  updateItem(id: string, index: number, patch: Partial<JobItem>): void {
    const job = this.jobs.get(id);
    if (!job || !job.items[index]) return;
    const items = job.items.slice();
    items[index] = { ...items[index], ...patch };
    this.put({ ...job, items });
  }

  remove(id: string): void {
    this.jobs.delete(id);
    clearTimeout(this.pendingWrites.get(id));
    this.pendingWrites.delete(id);
    const file = new File(this.dir, `${id}.json`);
    if (file.exists) file.delete();
    this.emit();
  }

  private scheduleWrite(id: string): void {
    if (this.pendingWrites.has(id)) return;
    this.pendingWrites.set(
      id,
      setTimeout(() => {
        this.pendingWrites.delete(id);
        const job = this.jobs.get(id);
        if (job) new File(this.dir, `${id}.json`).write(JSON.stringify(job));
      }, WRITE_DELAY_MS),
    );
  }

  private emit(): void {
    this.snapshot = [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    for (const l of this.listeners) l();
  }
}

/** The app was killed mid-run: put interrupted work back in the queue. */
function recoverInterrupted(job: Job): Job {
  if (job.state !== "running" && !job.items.some((i) => i.status === "working")) return job;
  return {
    ...job,
    state: job.state === "running" ? "paused" : job.state,
    note: job.state === "running" ? "Interrupted when the app closed. Tap Resume." : job.note,
    items: job.items.map((i) =>
      i.status === "working" ? { ...i, status: "queued", stage: undefined, progress: undefined } : i,
    ),
  };
}
