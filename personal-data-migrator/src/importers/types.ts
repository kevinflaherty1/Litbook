import type { ImportedBundle, Platform } from "../model/types.ts";

export interface ImportOptions {
  /** Override the account handle when the export doesn't say who you are. */
  handle?: string;
}

/**
 * Reads a platform's official "download your data" archive (already unzipped)
 * and maps it to the common model. Media paths in the result are relative to
 * `exportDir`; the vault copies them in and rewrites ids to content hashes.
 */
export interface Importer {
  platform: Platform;
  /** Cheap check used for auto-detecting which platform an export is from. */
  detect(files: string[]): boolean;
  import(exportDir: string, options?: ImportOptions): Promise<ImportedBundle>;
}

/** Hands out temporary media ids during an import. */
export class MediaCollector {
  readonly media: ImportedBundle["media"] = {};
  #next = 0;

  add(asset: Omit<ImportedBundle["media"][string], "id">): string {
    const id = `tmp:${this.#next++}`;
    this.media[id] = { id, ...asset };
    return id;
  }
}
