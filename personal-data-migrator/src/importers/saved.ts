import { readFile } from "node:fs/promises";
import path from "node:path";
import { localId } from "../model/ids.ts";
import { fixMetaMojibake, toIso } from "../model/text.ts";
import type { Collection, SavedItem } from "../model/types.ts";
import { parseCsv } from "../util/csv.ts";
import { findFiles, readJson } from "../util/fs.ts";
import { parseYtd } from "../util/ytd.ts";

/*
 * Likes, saves, votes and collections from each platform's export.
 *
 *   Instagram  liked_posts.json, liked_comments.json, saved_posts.json,
 *              saved_collections.json (one flat list: a "Collection" header
 *              entry followed by the items filed under it)
 *   X/Twitter  like.js (tweet id, text, URL — no author or date).
 *              Bookmarks are not included in X archives.
 *   Reddit     saved_posts.csv, saved_comments.csv, post_votes.csv,
 *              comment_votes.csv
 */

export interface SavedResult {
  saved: SavedItem[];
  collections: Collection[];
}

interface IgValue {
  value?: string;
  href?: string;
  timestamp?: number;
}
interface IgEntry {
  title?: string;
  string_list_data?: IgValue[];
  string_map_data?: Record<string, IgValue>;
}

const fix = (s: string | undefined): string | undefined => (s ? fixMetaMojibake(s) : undefined);
const iso = (ts: number | undefined): string | undefined => (ts ? toIso(ts) : undefined);

/** `https://www.instagram.com/p/ABC123/` → `ABC123` */
function igShortcode(href: string | undefined): string | undefined {
  return href ? /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|tv)\/([\w-]+)/.exec(href)?.[1] : undefined;
}

async function readEntries(
  exportDir: string,
  files: string[],
  name: RegExp,
  key: string,
): Promise<IgEntry[]> {
  const out: IgEntry[] = [];
  for (const file of findFiles(files, name)) {
    const raw = await readJson<Record<string, IgEntry[]> | IgEntry[]>(path.join(exportDir, file));
    out.push(...(Array.isArray(raw) ? raw : (raw[key] ?? [])));
  }
  return out;
}

export async function readInstagramSaved(exportDir: string, files: string[]): Promise<SavedResult> {
  const saved: SavedItem[] = [];
  const byUrl = new Map<string, SavedItem>();

  const add = (item: Omit<SavedItem, "id" | "collections">): SavedItem => {
    const url = item.source.url ?? "";
    const key = `${item.kind}|${url}`;
    const existing = byUrl.get(key);
    if (existing) return existing;
    const full: SavedItem = {
      id: localId("instagram", "saved", item.kind, item.source.id ?? url, item.savedAt),
      collections: [],
      ...item,
    };
    byUrl.set(key, full);
    saved.push(full);
    return full;
  };

  for (const [file, key, targetType] of [
    [/^liked_posts\.json$/, "likes_media_likes", "post"],
    [/^liked_comments\.json$/, "likes_comment_likes", "comment"],
  ] as const) {
    for (const e of await readEntries(exportDir, files, file, key)) {
      const v = e.string_list_data?.[0];
      if (!v?.href) continue;
      add({
        kind: "like",
        source: { platform: "instagram", id: igShortcode(v.href), url: v.href },
        targetType,
        author: fix(e.title),
        savedAt: iso(v.timestamp),
      });
    }
  }

  for (const e of await readEntries(exportDir, files, /^saved_posts\.json$/, "saved_saved_media")) {
    const v = e.string_map_data?.["Saved on"];
    if (!v?.href) continue;
    add({
      kind: "save",
      source: { platform: "instagram", id: igShortcode(v.href), url: v.href },
      targetType: "post",
      author: fix(e.title),
      savedAt: iso(v.timestamp),
    });
  }

  const collections: Collection[] = [];
  let current: Collection | undefined;
  for (const e of await readEntries(
    exportDir,
    files,
    /^saved_collections\.json$/,
    "saved_saved_collections",
  )) {
    const map = e.string_map_data ?? {};
    if (e.title === "Collection") {
      const name = fix(map["Name"]?.value) ?? "Untitled";
      current = {
        id: localId("instagram", "collection", name, map["Creation Time"]?.timestamp),
        name,
        createdAt: iso(map["Creation Time"]?.timestamp),
        updatedAt: iso(map["Update Time"]?.timestamp),
        itemIds: [],
      };
      collections.push(current);
      continue;
    }
    const href = map["Name"]?.href;
    if (!current || !href) continue;
    // Items in a collection are also saves; merge with saved_posts.json when present.
    const item = add({
      kind: "save",
      source: { platform: "instagram", id: igShortcode(href), url: href },
      targetType: "post",
      author: fix(map["Name"]?.value),
      savedAt: iso(map["Added Time"]?.timestamp),
    });
    if (!item.collections.includes(current.name)) item.collections.push(current.name);
    if (!current.itemIds.includes(item.id)) current.itemIds.push(item.id);
  }

  return { saved, collections };
}

export async function readTwitterSaved(exportDir: string, files: string[]): Promise<SavedResult> {
  const saved: SavedItem[] = [];
  for (const file of findFiles(files, /^like(-part\d+)?\.js$/)) {
    const rows = parseYtd<{ like?: { tweetId?: string; fullText?: string; expandedUrl?: string } }>(
      await readFile(path.join(exportDir, file), "utf8"),
    );
    for (const { like } of rows) {
      if (!like?.tweetId) continue;
      saved.push({
        id: localId("twitter", "saved", "like", like.tweetId),
        kind: "like",
        source: {
          platform: "twitter",
          id: like.tweetId,
          url: like.expandedUrl ?? `https://x.com/i/web/status/${like.tweetId}`,
        },
        targetType: "post",
        textPreview: like.fullText,
        collections: [],
      });
    }
  }
  return { saved, collections: [] };
}

export async function readRedditSaved(exportDir: string, files: string[]): Promise<SavedResult> {
  const saved: SavedItem[] = [];
  const read = async (name: string) => {
    const [file] = findFiles(files, new RegExp(`^${name}\\.csv$`));
    return file ? parseCsv(await readFile(path.join(exportDir, file), "utf8")) : [];
  };
  const subreddit = (permalink: string) => /\/r\/([\w-]+)\//.exec(permalink)?.[1];

  for (const [name, kind, targetType] of [
    ["saved_posts", "save", "post"],
    ["saved_comments", "save", "comment"],
    ["post_votes", "vote", "post"],
    ["comment_votes", "vote", "comment"],
  ] as const) {
    for (const row of await read(name)) {
      const id = row["id"];
      const permalink = row["permalink"] ?? "";
      if (!id) continue;
      const dir = row["direction"];
      if (kind === "vote" && dir !== "up" && dir !== "down") continue; // "none" = vote removed
      saved.push({
        id: localId("reddit", "saved", kind, targetType, id),
        kind,
        source: { platform: "reddit", id, url: permalink || undefined },
        targetType,
        community: subreddit(permalink),
        direction: kind === "vote" ? (dir as "up" | "down") : undefined,
        collections: [],
      });
    }
  }
  return { saved, collections: [] };
}
