import TextRecognition from "@react-native-ml-kit/text-recognition";
import { Directory, File, Paths } from "expo-file-system";
import * as VideoThumbnails from "expo-video-thumbnails";
import { extractWavAsync } from "../../modules/audio-extract";

import { frameTimesMs } from "./frameSchedule";
import { MediaInfoError, parseMediaInfo, type MediaPart } from "./mediaInfo";
import { shortcodeToMediaId } from "./shortcode";
import { transcribeWav } from "./speech";
import { filterByRegion, OcrAccumulator, type OcrLineInput } from "./textMerge";
import type { ItemStage, JobItem, JobOptions } from "./types";

export interface MediaBridge {
  /** GET /api/v1/media/<id>/info/ from inside the logged-in WebView. */
  fetchMediaInfo(mediaId: string, shortcode: string): Promise<{ status: number; body: string }>;
}

/** The session is logged out or blocked; the whole job should pause. */
export class SessionError extends Error {}
/** Instagram is throttling; the whole job should pause and resume later. */
export class RateLimitError extends Error {}
export class AbortedError extends Error {}

type Report = (stage: ItemStage, progress?: string) => void;

const workDir = new Directory(Paths.cache, "harvest");

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new AbortedError("Paused");
}

async function resolve(bridge: MediaBridge, shortcode: string) {
  const { status, body } = await bridge.fetchMediaInfo(shortcodeToMediaId(shortcode), shortcode);
  if (status === 429) throw new RateLimitError("Instagram is rate-limiting requests. Wait a while, then Resume.");
  if (status === 401 || status === 403 || /login_required|checkpoint_required/.test(body.slice(0, 2000))) {
    throw new SessionError("Instagram needs you to log in again. Open the browser, log in, then Resume.");
  }
  if (status === 404) throw new MediaInfoError("Post not found (deleted or private)");
  if (status !== 200) throw new MediaInfoError(`Instagram returned HTTP ${status}`);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new SessionError("Instagram returned a web page instead of data. Log in again, then Resume.");
  }
  return parseMediaInfo(json);
}

function linesOf(result: Awaited<ReturnType<typeof TextRecognition.recognize>>): OcrLineInput[] {
  const out: OcrLineInput[] = [];
  for (const block of result.blocks) for (const line of block.lines) out.push({ text: line.text, frame: line.frame });
  return out;
}

async function ocrImage(uri: string, width: number, height: number, options: JobOptions): Promise<string[]> {
  const result = await TextRecognition.recognize(uri);
  return filterByRegion(linesOf(result), width, height, options.margins).map((l) => l.text);
}

async function processVideo(
  part: Extract<MediaPart, { kind: "video" }>,
  partIndex: number,
  file: File,
  acc: OcrAccumulator,
  options: JobOptions,
  signal: AbortSignal,
  report: Report,
): Promise<string | null> {
  const times = frameTimesMs(part.durationSec, { fps: options.fps, maxFrames: options.maxFrames });
  for (let i = 0; i < times.length; i++) {
    checkAbort(signal);
    report("reading frames", `frame ${i + 1}/${times.length}`);
    let thumb: VideoThumbnails.VideoThumbnailsResult;
    try {
      thumb = await VideoThumbnails.getThumbnailAsync(file.uri, { time: times[i], quality: 0.8 });
    } catch {
      // Past the real end of the video (reported duration was rounded up).
      if (i > 0) break;
      throw new Error("Could not read frames from the video");
    }
    try {
      acc.add(partIndex, times[i] / 1000, await ocrImage(thumb.uri, thumb.width, thumb.height, options));
    } finally {
      const frame = new File(thumb.uri);
      if (frame.exists) frame.delete();
    }
  }

  if (!options.speech) return null;
  checkAbort(signal);
  report("transcribing");
  const wav = new File(workDir, `${file.name}.wav`);
  try {
    const audio = await extractWavAsync(file.uri, wav.uri, 16000);
    if (!audio.hasAudio || audio.durationMs < 300) return null;
    return (await transcribeWav(wav.uri, options.language)) || null;
  } finally {
    if (wav.exists) wav.delete();
  }
}

export type ProcessResult = Pick<JobItem, "author" | "caption" | "kinds" | "ocr" | "transcript"> & {
  empty: boolean;
};

export async function processItem(
  shortcode: string,
  options: JobOptions,
  bridge: MediaBridge,
  signal: AbortSignal,
  report: Report,
): Promise<ProcessResult> {
  report("resolving");
  const info = await resolve(bridge, shortcode);
  workDir.create({ intermediates: true, idempotent: true });

  const acc = new OcrAccumulator();
  const transcripts: string[] = [];
  for (let p = 0; p < info.parts.length; p++) {
    checkAbort(signal);
    const part = info.parts[p];
    const label = info.parts.length > 1 ? ` (${p + 1}/${info.parts.length})` : "";
    report("downloading", label.trim() || undefined);
    const ext = part.kind === "video" ? "mp4" : "jpg";
    const file = new File(workDir, `${shortcode}-${p}.${ext}`);
    try {
      await File.downloadFileAsync(part.url, file, { idempotent: true });
      if (part.kind === "image") {
        report("reading frames", `image${label}`);
        acc.add(p, 0, await ocrImage(file.uri, part.width, part.height, options));
      } else {
        const text = await processVideo(part, p, file, acc, options, signal, (stage, progress) =>
          report(stage, [progress, label.trim()].filter(Boolean).join(" ") || undefined),
        );
        if (text) transcripts.push(info.parts.length > 1 ? `[${p + 1}] ${text}` : text);
      }
    } finally {
      if (file.exists) file.delete();
    }
  }

  return {
    author: info.author,
    caption: info.caption,
    kinds: info.parts.map((p) => p.kind),
    ocr: acc.result(),
    transcript: transcripts.length ? transcripts.join("\n\n") : null,
    empty: info.parts.length === 0,
  };
}
