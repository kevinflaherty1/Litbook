import { postUrl } from "./shortcode";
import type { Job, JobItem } from "./types";

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function itemText(item: JobItem): string {
  return item.ocr.map((l) => l.text).join("\n");
}

export function toMarkdown(job: Job): string {
  const out: string[] = [`# ${job.collection.name}`, ""];
  out.push(`Source: ${job.collection.url}  `);
  out.push(`Exported: ${new Date().toISOString().slice(0, 10)}`, "");
  for (const item of job.items) {
    if (item.status !== "done") continue;
    out.push(`## ${item.author ? `@${item.author} — ` : ""}${item.shortcode}`, "", postUrl(item.shortcode), "");
    if (item.caption) out.push("**Caption**", "", item.caption.trim(), "");
    if (item.ocr.length) {
      out.push("**On-screen text**", "");
      const multiPart = new Set(item.ocr.map((l) => l.part)).size > 1;
      for (const line of item.ocr) {
        const where = multiPart ? `${line.part + 1}·${fmtTime(line.firstSeenSec)}` : fmtTime(line.firstSeenSec);
        out.push(`- \`${where}\` ${line.text}`);
      }
      out.push("");
    }
    if (item.transcript) out.push("**Speech**", "", item.transcript, "");
  }
  const failed = job.items.filter((i) => i.status === "failed");
  if (failed.length) {
    out.push("## Not processed", "");
    for (const i of failed) out.push(`- ${postUrl(i.shortcode)} — ${i.error ?? "failed"}`);
    out.push("");
  }
  return out.join("\n");
}

export function toJson(job: Job): string {
  return JSON.stringify(
    {
      collection: job.collection,
      exportedAt: new Date().toISOString(),
      items: job.items.map((i) => ({
        url: postUrl(i.shortcode),
        shortcode: i.shortcode,
        status: i.status,
        error: i.error,
        author: i.author ?? null,
        caption: i.caption ?? null,
        kinds: i.kinds ?? [],
        onScreenText: i.ocr,
        transcript: i.transcript,
      })),
    },
    null,
    2,
  );
}
