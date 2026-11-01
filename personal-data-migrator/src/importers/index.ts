import type { Platform } from "../model/types.ts";
import { listFiles } from "../util/fs.ts";
import { instagramImporter } from "./instagram.ts";
import { redditImporter } from "./reddit.ts";
import { twitterImporter } from "./twitter.ts";
import type { Importer } from "./types.ts";

export const importers: Record<Platform, Importer> = {
  instagram: instagramImporter,
  twitter: twitterImporter,
  reddit: redditImporter,
};

/** Guess which platform an unzipped export folder came from. */
export async function detectPlatform(exportDir: string): Promise<Platform | undefined> {
  const files = await listFiles(exportDir);
  return Object.values(importers).find((i) => i.detect(files))?.platform;
}

export type { Importer, ImportOptions } from "./types.ts";
