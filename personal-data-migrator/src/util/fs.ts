import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { MediaKind } from "../model/types.ts";

/** Recursively list files under `root`, as paths relative to it (posix style). */
export async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return out.sort();
}

/** Find export files by basename pattern, wherever the platform put them this year. */
export function findFiles(files: string[], pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(path.posix.basename(f)));
}

export async function readJson<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

const MIME: Record<string, [string, MediaKind]> = {
  ".jpg": ["image/jpeg", "image"],
  ".jpeg": ["image/jpeg", "image"],
  ".png": ["image/png", "image"],
  ".webp": ["image/webp", "image"],
  ".heic": ["image/heic", "image"],
  ".gif": ["image/gif", "gif"],
  ".mp4": ["video/mp4", "video"],
  ".mov": ["video/quicktime", "video"],
  ".webm": ["video/webm", "video"],
  ".m4a": ["audio/mp4", "audio"],
  ".mp3": ["audio/mpeg", "audio"],
};

export function guessMedia(fileOrUrl: string): { mimeType?: string; kind: MediaKind } {
  const ext = path.extname(fileOrUrl.split("?")[0] ?? "").toLowerCase();
  const hit = MIME[ext];
  return hit ? { mimeType: hit[0], kind: hit[1] } : { kind: "image" };
}

export function extensionFor(mimeType: string | undefined): string {
  for (const [ext, [mime]] of Object.entries(MIME)) if (mime === mimeType) return ext;
  return ".bin";
}
