import path from "node:path";
import { localId } from "../model/ids.ts";
import { extractEntities, fixMetaMojibake, toIso } from "../model/text.ts";
import type { Comment, Connection, ImportedBundle, Post, Profile } from "../model/types.ts";
import { findFiles, guessMedia, listFiles, readJson } from "../util/fs.ts";
import { readInstagramSaved } from "./saved.ts";
import { MediaCollector, type Importer, type ImportOptions } from "./types.ts";

/*
 * Instagram "Download your information" export, JSON format. Meta moves files
 * between folders across export versions, so files are located by basename:
 *   personal_information.json            profile
 *   posts_1.json, posts_2.json, ...      feed posts (single + carousel)
 *   reels.json                           reels
 *   post_comments_1.json / comments.json comments you wrote
 *   followers_1.json, following.json     connections
 */

interface IgMedia {
  uri: string;
  creation_timestamp?: number;
  title?: string;
  media_metadata?: { photo_metadata?: unknown; video_metadata?: unknown };
}
interface IgPost {
  media: IgMedia[];
  title?: string;
  creation_timestamp?: number;
}
interface IgStringMap {
  string_map_data?: Record<string, { value?: string; href?: string; timestamp?: number }>;
}
interface IgListEntry {
  title?: string;
  string_list_data?: { href?: string; value?: string; timestamp?: number }[];
}

const fix = (s: string | undefined): string => fixMetaMojibake(s ?? "");

export const instagramImporter: Importer = {
  platform: "instagram",

  detect(files) {
    return findFiles(files, /^(posts_\d+|personal_information|followers_\d+)\.json$/).length > 0;
  },

  async import(exportDir: string, options: ImportOptions = {}): Promise<ImportedBundle> {
    const files = await listFiles(exportDir);
    const abs = (f: string): string => path.join(exportDir, f);
    const warnings: string[] = [];
    const media = new MediaCollector();

    // Profile
    let profile: Profile = { platform: "instagram", handle: options.handle ?? "unknown" };
    const [personal] = findFiles(files, /^personal_information\.json$/);
    if (personal) {
      const data = await readJson<{ profile_user?: IgStringMap[] }>(abs(personal));
      const map = data.profile_user?.[0]?.string_map_data ?? {};
      profile = {
        platform: "instagram",
        handle: options.handle ?? (fix(map["Username"]?.value) || "unknown"),
        displayName: fix(map["Name"]?.value) || undefined,
        bio: fix(map["Bio"]?.value) || undefined,
        website: fix(map["Website"]?.value) || undefined,
      };
    } else if (!options.handle) {
      warnings.push("personal_information.json not found; handle unknown (pass --handle)");
    }

    const addMedia = (m: IgMedia): string => {
      const guess = guessMedia(m.uri);
      const isRemote = /^https?:/.test(m.uri);
      return media.add({
        kind: guess.kind,
        mimeType: guess.mimeType,
        ...(isRemote ? { remoteUrl: m.uri } : { path: m.uri }),
      });
    };

    const toPost = (p: IgPost, kind: "post" | "reel"): Post => {
      // Single-image posts carry the caption on the media item, not the post.
      const caption = fix(p.title || p.media[0]?.title);
      const ts = p.creation_timestamp ?? p.media[0]?.creation_timestamp ?? 0;
      return {
        id: localId("instagram", "post", ts, p.media.map((m) => m.uri).join(",")),
        source: { platform: "instagram" },
        createdAt: toIso(ts),
        text: caption,
        entities: extractEntities(caption),
        mediaIds: p.media.map(addMedia),
        visibility: "unknown",
        engagement: {},
        extensions: { instagram: { kind } },
      };
    };

    // Posts
    const posts: Post[] = [];
    for (const file of findFiles(files, /^posts_\d+\.json$/)) {
      const data = await readJson<IgPost[]>(abs(file));
      for (const p of data) {
        if (!p.media?.length) {
          warnings.push(`${file}: skipped a post with no media`);
          continue;
        }
        posts.push(toPost(p, "post"));
      }
    }
    for (const file of findFiles(files, /^reels\.json$/)) {
      const data = await readJson<{ ig_reels_media?: IgPost[] }>(abs(file));
      for (const p of data.ig_reels_media ?? []) if (p.media?.length) posts.push(toPost(p, "reel"));
    }

    // Comments
    const comments: Comment[] = [];
    for (const file of findFiles(files, /^(post_comments_\d+|comments|reels_comments)\.json$/)) {
      const raw = await readJson<IgStringMap[] | Record<string, IgStringMap[]>>(abs(file));
      const entries = Array.isArray(raw) ? raw : Object.values(raw).flat();
      for (const entry of entries) {
        const map = entry.string_map_data ?? {};
        const text = fix(map["Comment"]?.value);
        const ts = map["Time"]?.timestamp;
        if (!text || !ts) continue;
        comments.push({
          id: localId("instagram", "comment", ts, text),
          source: { platform: "instagram" },
          createdAt: toIso(ts),
          text,
          entities: extractEntities(text),
          engagement: {},
          extensions: { instagram: { mediaOwner: fix(map["Media Owner"]?.value) || undefined } },
        });
      }
    }

    // Connections
    const connections: Connection[] = [];
    const readConnections = async (pattern: RegExp, direction: Connection["direction"]) => {
      for (const file of findFiles(files, pattern)) {
        const raw = await readJson<IgListEntry[] | Record<string, IgListEntry[]>>(abs(file));
        const entries = Array.isArray(raw) ? raw : Object.values(raw).flat();
        for (const e of entries) {
          const item = e.string_list_data?.[0];
          const handle = fix(item?.value || e.title);
          if (!handle) continue;
          connections.push({
            direction,
            handle,
            profileUrl: item?.href,
            since: item?.timestamp ? toIso(item.timestamp) : undefined,
          });
        }
      }
    };
    await readConnections(/^followers_\d+\.json$/, "follower");
    await readConnections(/^following\.json$/, "following");

    posts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const { saved, collections } = await readInstagramSaved(exportDir, files);
    return {
      schemaVersion: 1,
      source: "instagram",
      profile,
      posts,
      comments,
      connections,
      media: media.media,
      saved,
      collections,
      importWarnings: warnings,
    };
  },
};
