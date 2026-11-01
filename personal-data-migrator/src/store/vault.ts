import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Bundle, ImportedBundle, MediaAsset } from "../model/types.ts";
import { validateBundle } from "../model/validate.ts";
import { exists, extensionFor } from "../util/fs.ts";

/*
 * The vault is a plain folder on the user's device. Nothing leaves the machine.
 *
 *   <root>/index.json                 summary of every imported bundle
 *   <root>/bundles/<bundleId>.json    one Bundle (common model) per import
 *   <root>/media/ab/<sha256>.<ext>    media, deduped by content hash
 *
 * Plain JSON on purpose: the user's data should stay readable without this
 * tool. Directories are created 0700 and files 0600 since this is personal data.
 */

export interface BundleSummary {
  id: string;
  source: Bundle["source"];
  handle: string;
  importedAt: string;
  counts: { posts: number; comments: number; connections: number; media: number };
}

export function defaultVaultRoot(): string {
  if (process.env["PDM_VAULT"]) return path.resolve(process.env["PDM_VAULT"]);
  const base = process.env["XDG_DATA_HOME"] ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "personal-data-migrator");
}

async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await rename(tmp, file);
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

export class Vault {
  readonly root: string;

  constructor(root: string = defaultVaultRoot()) {
    this.root = root;
  }

  #bundlePath(id: string): string {
    if (!/^[\w.-]+$/.test(id)) throw new Error(`Invalid bundle id: ${id}`);
    return path.join(this.root, "bundles", `${id}.json`);
  }

  mediaPath(asset: MediaAsset): string | undefined {
    return asset.path ? path.join(this.root, asset.path) : undefined;
  }

  async init(): Promise<void> {
    await mkdir(path.join(this.root, "bundles"), { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.root, "media"), { recursive: true, mode: 0o700 });
  }

  async list(): Promise<BundleSummary[]> {
    const file = path.join(this.root, "index.json");
    if (!(await exists(file))) return [];
    return JSON.parse(await readFile(file, "utf8")) as BundleSummary[];
  }

  async load(id: string): Promise<Bundle> {
    const bundle = JSON.parse(await readFile(this.#bundlePath(id), "utf8")) as Bundle;
    const errors = validateBundle(bundle);
    if (errors.length) throw new Error(`Bundle ${id} is invalid:\n  ${errors.join("\n  ")}`);
    return bundle;
  }

  /** The most recent bundle, optionally for one platform. */
  async latest(source?: Bundle["source"]): Promise<BundleSummary | undefined> {
    const all = (await this.list()).filter((b) => !source || b.source === source);
    return all.sort((a, b) => a.importedAt.localeCompare(b.importedAt)).at(-1);
  }

  /**
   * Store an importer's output: copy media in (content-addressed), rewrite
   * temporary media ids to `sha256:<hex>`, write the bundle, update the index.
   */
  async save(imported: ImportedBundle, exportDir: string, now: Date = new Date()): Promise<Bundle> {
    await this.init();
    const idMap = new Map<string, string>();
    const media: Record<string, MediaAsset> = {};
    const warnings = [...imported.importWarnings];

    for (const asset of Object.values(imported.media)) {
      let stored: MediaAsset;
      if (asset.path) {
        const src = path.resolve(exportDir, asset.path);
        if (!src.startsWith(path.resolve(exportDir) + path.sep)) {
          warnings.push(`media path escapes the export folder, skipped: ${asset.path}`);
          continue;
        }
        if (!(await exists(src))) {
          warnings.push(`media file missing from export: ${asset.path}`);
          stored = { ...asset, id: `missing:${asset.path}`, path: undefined };
        } else {
          const hex = await sha256File(src);
          const ext = path.extname(src).toLowerCase() || extensionFor(asset.mimeType);
          const rel = path.posix.join("media", hex.slice(0, 2), `${hex}${ext}`);
          const dest = path.join(this.root, rel);
          if (!(await exists(dest))) {
            await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
            await copyFile(src, dest);
          }
          stored = { ...asset, id: `sha256:${hex}`, path: rel };
        }
      } else {
        const key = createHash("sha256")
          .update(asset.remoteUrl ?? "")
          .digest("hex");
        stored = { ...asset, id: `remote:${key}` };
      }
      idMap.set(asset.id, stored.id);
      media[stored.id] = stored;
    }

    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "Z");
    const handle = imported.profile.handle.replace(/[^\w.-]/g, "_");
    const bundle: Bundle = {
      ...imported,
      id: `${imported.source}-${handle}-${stamp}`,
      importedAt: now.toISOString(),
      profile: {
        ...imported.profile,
        avatarMediaId: imported.profile.avatarMediaId && idMap.get(imported.profile.avatarMediaId),
      },
      posts: imported.posts.map((p) => ({
        ...p,
        mediaIds: p.mediaIds.map((m) => idMap.get(m)).filter((m): m is string => !!m),
      })),
      media,
      importWarnings: warnings,
    };

    const errors = validateBundle(bundle);
    if (errors.length) throw new Error(`Import produced an invalid bundle:\n  ${errors.join("\n  ")}`);

    const serialized = JSON.stringify(bundle, null, 2);
    await writeFileAtomic(this.#bundlePath(bundle.id), serialized);
    const index = (await this.list()).filter((b) => b.id !== bundle.id);
    index.push({
      id: bundle.id,
      source: bundle.source,
      handle: bundle.profile.handle,
      importedAt: bundle.importedAt,
      counts: {
        posts: bundle.posts.length,
        comments: bundle.comments.length,
        connections: bundle.connections.length,
        media: Object.keys(media).length,
      },
    });
    await writeFileAtomic(path.join(this.root, "index.json"), JSON.stringify(index, null, 2));
    // Return exactly what's on disk (no undefined-valued keys), so callers see what load() will.
    return JSON.parse(serialized) as Bundle;
  }

  /** Remove a bundle. Media is left in place since other bundles may share it. */
  async remove(id: string): Promise<void> {
    await rm(this.#bundlePath(id), { force: true });
    const index = (await this.list()).filter((b) => b.id !== id);
    await writeFileAtomic(path.join(this.root, "index.json"), JSON.stringify(index, null, 2));
  }
}
