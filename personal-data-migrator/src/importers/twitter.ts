import { readFile } from "node:fs/promises";
import path from "node:path";
import { localId } from "../model/ids.ts";
import { decodeHtmlEntities, extractEntities, toIso } from "../model/text.ts";
import type { Comment, Connection, ImportedBundle, MediaKind, Post, Profile } from "../model/types.ts";
import { findFiles, guessMedia, listFiles } from "../util/fs.ts";
import { MediaCollector, type Importer, type ImportOptions } from "./types.ts";

/*
 * X/Twitter archive ("Download an archive of your data"), unzipped. Data files
 * are JavaScript, not JSON: `window.YTD.tweets.part0 = [ ... ]`.
 *   data/account.js, data/profile.js   profile
 *   data/tweets.js (older: tweet.js)   tweets, possibly split into tweets-part1.js ...
 *   data/tweets_media/<tweetId>-<name> attached media
 *   data/follower.js, data/following.js
 *
 * Mapping decisions:
 *   - Replies to yourself are thread continuations → Post with a shared threadId.
 *   - Replies to anyone else → Comment.
 *   - "RT @x: ..." → Post with relation.kind = "repost".
 */

interface TwUrl {
  url: string;
  expanded_url?: string;
}
interface TwMedia {
  url: string;
  media_url_https: string;
  type: "photo" | "video" | "animated_gif";
  ext_alt_text?: string;
  video_info?: {
    duration_millis?: string;
    variants?: { url: string; content_type?: string; bitrate?: string }[];
  };
}
interface Tweet {
  id_str: string;
  full_text: string;
  created_at: string;
  favorite_count?: string;
  retweet_count?: string;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
  entities?: { urls?: TwUrl[]; media?: TwMedia[] };
  extended_entities?: { media?: TwMedia[] };
}

/** Parse a `window.YTD.<name>.partN = [...]` file. */
export function parseYtd<T>(source: string): T[] {
  const start = source.indexOf("=");
  if (start === -1) throw new Error("Not a Twitter archive data file");
  return JSON.parse(
    source
      .slice(start + 1)
      .trim()
      .replace(/;$/, ""),
  ) as T[];
}

async function readYtd<T>(exportDir: string, files: string[], pattern: RegExp): Promise<T[]> {
  const out: T[] = [];
  for (const file of findFiles(files, pattern)) {
    out.push(...parseYtd<T>(await readFile(path.join(exportDir, file), "utf8")));
  }
  return out;
}

const KIND: Record<TwMedia["type"], MediaKind> = { photo: "image", video: "video", animated_gif: "gif" };

export const twitterImporter: Importer = {
  platform: "twitter",

  detect(files) {
    return findFiles(files, /^(tweets?|account)(-part\d+)?\.js$/).length > 0;
  },

  async import(exportDir: string, options: ImportOptions = {}): Promise<ImportedBundle> {
    const files = await listFiles(exportDir);
    const fileSet = new Set(files);
    const warnings: string[] = [];
    const media = new MediaCollector();

    const [accountRow] = await readYtd<{
      account: { username: string; accountDisplayName?: string; accountId?: string; createdAt?: string };
    }>(exportDir, files, /^account\.js$/);
    const [profileRow] = await readYtd<{ profile: { description?: { bio?: string; website?: string } } }>(
      exportDir,
      files,
      /^profile\.js$/,
    );
    const account = accountRow?.account;
    if (!account && !options.handle) warnings.push("account.js not found; handle unknown (pass --handle)");
    const ownId = account?.accountId;
    const profile: Profile = {
      platform: "twitter",
      handle: options.handle ?? account?.username ?? "unknown",
      displayName: account?.accountDisplayName,
      bio: profileRow?.profile.description?.bio || undefined,
      website: profileRow?.profile.description?.website || undefined,
      createdAt: account?.createdAt ? toIso(account.createdAt) : undefined,
    };

    const tweets = (await readYtd<{ tweet: Tweet }>(exportDir, files, /^tweets?(-part\d+)?\.js$/)).map(
      (r) => r.tweet,
    );
    const byId = new Map(tweets.map((t) => [t.id_str, t]));
    const isSelfReply = (t: Tweet): boolean =>
      !!t.in_reply_to_status_id_str &&
      (t.in_reply_to_user_id_str === ownId || byId.has(t.in_reply_to_status_id_str));

    const hasSelfReply = new Set(tweets.filter(isSelfReply).map((t) => t.in_reply_to_status_id_str!));

    const threadRoot = (t: Tweet): string => {
      let cur = t;
      for (let guard = 0; guard < 10_000 && cur.in_reply_to_status_id_str; guard++) {
        const parent = byId.get(cur.in_reply_to_status_id_str);
        if (!parent) break;
        cur = parent;
      }
      return cur.id_str;
    };

    const cleanText = (t: Tweet, mediaItems: TwMedia[]): string => {
      let text = t.full_text;
      for (const m of mediaItems) text = text.split(m.url).join("");
      for (const u of t.entities?.urls ?? []) text = text.split(u.url).join(u.expanded_url ?? u.url);
      return decodeHtmlEntities(text).trim();
    };

    const collectMedia = (t: Tweet, items: TwMedia[]): string[] =>
      items.map((m) => {
        const best = m.video_info?.variants
          ?.filter((v) => v.content_type?.startsWith("video/"))
          .sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))[0];
        const remote = best?.url ?? m.media_url_https;
        const basename = path.posix.basename(remote.split("?")[0]!);
        const local = [
          `data/tweets_media/${t.id_str}-${basename}`,
          `data/tweet_media/${t.id_str}-${basename}`,
        ].find((p) => fileSet.has(p));
        if (!local) warnings.push(`tweet ${t.id_str}: media ${basename} not in archive, keeping remote URL`);
        return media.add({
          kind: KIND[m.type],
          mimeType: best?.content_type ?? guessMedia(remote).mimeType,
          altText: m.ext_alt_text,
          durationSeconds: m.video_info?.duration_millis
            ? Number(m.video_info.duration_millis) / 1000
            : undefined,
          ...(local ? { path: local } : { remoteUrl: remote }),
        });
      });

    const posts: Post[] = [];
    const comments: Comment[] = [];
    for (const t of tweets) {
      const mediaItems = t.extended_entities?.media ?? t.entities?.media ?? [];
      const text = cleanText(t, mediaItems);
      const createdAt = toIso(t.created_at);
      const url = `https://x.com/${profile.handle}/status/${t.id_str}`;
      const engagement = { likes: Number(t.favorite_count ?? 0), shares: Number(t.retweet_count ?? 0) };

      if (t.in_reply_to_status_id_str && !isSelfReply(t)) {
        comments.push({
          id: localId("twitter", "comment", t.id_str),
          source: { platform: "twitter", id: t.id_str, url },
          createdAt,
          text,
          entities: extractEntities(text),
          parentSourceId: t.in_reply_to_status_id_str,
          parentUrl: t.in_reply_to_screen_name
            ? `https://x.com/${t.in_reply_to_screen_name}/status/${t.in_reply_to_status_id_str}`
            : undefined,
          engagement,
        });
        continue;
      }

      const repost = /^RT @(\w+):/.exec(text);
      const root = threadRoot(t);
      const links = (t.entities?.urls ?? []).map((u) => u.expanded_url ?? u.url);
      posts.push({
        id: localId("twitter", "post", t.id_str),
        source: { platform: "twitter", id: t.id_str, url },
        createdAt,
        text,
        entities: extractEntities(text),
        mediaIds: collectMedia(t, mediaItems),
        linkUrl: links.length === 1 && !repost ? links[0] : undefined,
        relation: repost ? { kind: "repost", targetUrl: `https://x.com/${repost[1]}` } : undefined,
        threadId:
          root !== t.id_str || hasSelfReply.has(t.id_str) ? localId("twitter", "post", root) : undefined,
        visibility: "public",
        engagement,
      });
    }

    const connections: Connection[] = [];
    for (const [pattern, key, direction] of [
      [/^follower\.js$/, "follower", "follower"],
      [/^following\.js$/, "following", "following"],
    ] as const) {
      const rows = await readYtd<Record<string, { accountId: string; userLink?: string }>>(
        exportDir,
        files,
        pattern,
      );
      for (const row of rows) {
        const c = row[key];
        if (!c) continue;
        // The archive only has numeric ids; the handle is unknown until resolved online.
        connections.push({
          direction,
          handle: `id:${c.accountId}`,
          sourceId: c.accountId,
          profileUrl: c.userLink,
        });
      }
    }

    posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      schemaVersion: 1,
      source: "twitter",
      profile,
      posts,
      comments,
      connections,
      media: media.media,
      importWarnings: warnings,
    };
  },
};
