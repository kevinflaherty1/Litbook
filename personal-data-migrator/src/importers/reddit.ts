import { readFile } from "node:fs/promises";
import path from "node:path";
import { localId } from "../model/ids.ts";
import { extractEntities, toIso } from "../model/text.ts";
import type { Comment, ImportedBundle, Post, Profile } from "../model/types.ts";
import { parseCsv } from "../util/csv.ts";
import { findFiles, guessMedia, listFiles } from "../util/fs.ts";
import { MediaCollector, type Importer, type ImportOptions } from "./types.ts";

/*
 * Reddit data request export (reddit.com/settings/data-request), unzipped CSVs:
 *   posts.csv     id, permalink, date, ip, subreddit, gildings, title, url, body
 *   comments.csv  id, permalink, date, ip, subreddit, gildings, link, parent, body, media
 *   statistics.csv  statistic, value   (includes "account name" on newer exports)
 *
 * The export contains no media bytes or vote counts. Image posts become media
 * with a remoteUrl the vault can optionally fetch later. IP addresses are
 * deliberately dropped.
 */

const IMAGE_HOSTS = /^https?:\/\/(i\.redd\.it|i\.imgur\.com|preview\.redd\.it)\//;
const VIDEO_HOSTS = /^https?:\/\/v\.redd\.it\//;

/** Reddit writes "2023-01-15 18:22:01 UTC". */
function redditDate(value: string): string {
  return toIso(value.replace(" UTC", "Z").replace(" ", "T"));
}

async function readCsv(exportDir: string, files: string[], name: string): Promise<Record<string, string>[]> {
  const [file] = findFiles(files, new RegExp(`^${name}\\.csv$`));
  return file ? parseCsv(await readFile(path.join(exportDir, file), "utf8")) : [];
}

export const redditImporter: Importer = {
  platform: "reddit",

  detect(files) {
    return findFiles(files, /^(posts|comments)\.csv$/).length > 0;
  },

  async import(exportDir: string, options: ImportOptions = {}): Promise<ImportedBundle> {
    const files = await listFiles(exportDir);
    const warnings: string[] = [];
    const media = new MediaCollector();

    const stats = await readCsv(exportDir, files, "statistics");
    const accountName = stats.find((r) => r["statistic"]?.toLowerCase() === "account name")?.["value"];
    if (!accountName && !options.handle)
      warnings.push("account name not found in export; handle unknown (pass --handle)");
    const profile: Profile = { platform: "reddit", handle: options.handle ?? accountName ?? "unknown" };

    const posts: Post[] = [];
    for (const row of await readCsv(exportDir, files, "posts")) {
      const id = row["id"] ?? "";
      const permalink = row["permalink"] ?? "";
      const url = row["url"] ?? "";
      const title = row["title"] ?? "";
      const body = row["body"] ?? "";
      const isSelf = !url || url === permalink || url.includes("/comments/" + id);
      const mediaIds: string[] = [];
      let linkUrl: string | undefined;
      if (!isSelf && (IMAGE_HOSTS.test(url) || VIDEO_HOSTS.test(url))) {
        const guess = guessMedia(url);
        mediaIds.push(
          media.add({
            kind: VIDEO_HOSTS.test(url) ? "video" : guess.kind,
            mimeType: guess.mimeType,
            remoteUrl: url,
          }),
        );
      } else if (!isSelf) {
        linkUrl = url;
      }
      posts.push({
        id: localId("reddit", "post", id),
        source: { platform: "reddit", id, url: permalink },
        createdAt: redditDate(row["date"] ?? ""),
        title,
        text: body,
        entities: extractEntities(`${title}\n${body}`),
        mediaIds,
        linkUrl,
        community: row["subreddit"] || undefined,
        visibility: "public",
        engagement: {},
        extensions:
          row["gildings"] && row["gildings"] !== "0"
            ? { reddit: { gildings: Number(row["gildings"]) } }
            : undefined,
      });
    }

    const comments: Comment[] = [];
    for (const row of await readCsv(exportDir, files, "comments")) {
      const body = row["body"] ?? "";
      comments.push({
        id: localId("reddit", "comment", row["id"]),
        source: { platform: "reddit", id: row["id"], url: row["permalink"] },
        createdAt: redditDate(row["date"] ?? ""),
        text: body,
        entities: extractEntities(body),
        parentSourceId: row["parent"] || undefined,
        parentUrl: row["link"] || undefined,
        community: row["subreddit"] || undefined,
        engagement: {},
      });
    }

    posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      schemaVersion: 1,
      source: "reddit",
      profile,
      posts,
      comments,
      connections: [],
      media: media.media,
      importWarnings: warnings,
    };
  },
};
