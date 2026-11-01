/**
 * The common data model.
 *
 * Every importer turns a platform's export into these shapes, the local vault
 * stores only these shapes, and every transformer reads only these shapes. Adding
 * a platform therefore means one importer and/or one transformer, never N×N
 * pairwise converters.
 *
 * Design rules:
 *  - Platform-neutral field names. Anything that only one platform has goes in
 *    `extensions[platform]`, so nothing is lost on a round trip.
 *  - Text is stored as plain text plus extracted entities (hashtags, mentions,
 *    links) rather than platform markup. Transformers re-render it.
 *  - Timestamps are ISO-8601 UTC strings. IDs from the source platform are kept
 *    in `source`, and every record also gets a stable local `id`.
 *  - Media is referenced by a local asset id; bytes live in the vault, deduped
 *    by content hash.
 */

export const SCHEMA_VERSION = 1;

export const PLATFORMS = ["instagram", "twitter", "reddit"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** Where a record came from on its original platform. */
export interface SourceRef {
  platform: Platform;
  /** The platform's own id for the record, when the export includes one. */
  id?: string;
  url?: string;
}

/** Hashtags, mentions and links found in a piece of text. */
export interface TextEntities {
  /** Without the leading `#`, original casing preserved. */
  hashtags: string[];
  /** Without the leading `@` (or `u/` on Reddit). */
  mentions: string[];
  urls: string[];
}

export type MediaKind = "image" | "video" | "gif" | "audio";

export interface MediaAsset {
  /** Local id: `sha256:<hex>` of the bytes once stored, or a temp id before. */
  id: string;
  kind: MediaKind;
  mimeType?: string;
  /** Path relative to the export root (at import time) or the vault (after). */
  path?: string;
  /** Remote URL when the export only links to the media. */
  remoteUrl?: string;
  altText?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bytes?: number;
}

export interface Engagement {
  likes?: number;
  shares?: number;
  replies?: number;
  /** Reddit's net score; other platforms leave this unset. */
  score?: number;
}

export type Visibility = "public" | "followers" | "private" | "unknown";

/**
 * Anything the user authored as a top-level piece of content: a tweet, an
 * Instagram post or reel, a Reddit submission.
 */
export interface Post {
  id: string;
  source: SourceRef;
  createdAt: string;
  /** Reddit titles; most other platforms have none. */
  title?: string;
  text: string;
  entities: TextEntities;
  /** Ordered: carousel order on Instagram, attachment order on Twitter. */
  mediaIds: string[];
  /** Outbound link the post is "about" (Reddit link posts, link tweets). */
  linkUrl?: string;
  /** Community/channel the post was made in (subreddit, etc). */
  community?: string;
  /** Set when this post replies to / quotes / reposts another. */
  relation?: {
    kind: "reply" | "quote" | "repost";
    targetSourceId?: string;
    targetUrl?: string;
  };
  /** Posts in the same thread share a threadId (e.g. a tweet thread). */
  threadId?: string;
  location?: { name?: string; latitude?: number; longitude?: number };
  visibility: Visibility;
  engagement: Engagement;
  /** Platform-specific leftovers, keyed by platform, kept for fidelity. */
  extensions?: Partial<Record<Platform, Record<string, unknown>>>;
}

/** A reply the user wrote on someone else's (or their own) content. */
export interface Comment {
  id: string;
  source: SourceRef;
  createdAt: string;
  text: string;
  entities: TextEntities;
  /** Source-platform id or URL of what was replied to. */
  parentSourceId?: string;
  parentUrl?: string;
  community?: string;
  engagement: Engagement;
  extensions?: Partial<Record<Platform, Record<string, unknown>>>;
}

export interface Connection {
  direction: "follower" | "following";
  handle: string;
  displayName?: string;
  profileUrl?: string;
  /** Platform id when known (Twitter exports only give numeric ids). */
  sourceId?: string;
  since?: string;
}

export interface Profile {
  platform: Platform;
  handle: string;
  displayName?: string;
  bio?: string;
  website?: string;
  avatarMediaId?: string;
  createdAt?: string;
}

/** Everything taken from one export of one account. */
export interface Bundle {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Local id for the bundle, assigned by the vault. */
  id: string;
  source: Platform;
  importedAt: string;
  profile: Profile;
  posts: Post[];
  comments: Comment[];
  connections: Connection[];
  media: Record<string, MediaAsset>;
  /** Things the importer saw but could not map, so the user knows. */
  importWarnings: string[];
}

/** What an importer returns before the vault assigns ids and copies media. */
export type ImportedBundle = Omit<Bundle, "id" | "importedAt">;
