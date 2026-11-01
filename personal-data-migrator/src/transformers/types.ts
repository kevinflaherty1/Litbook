import type { Bundle, MediaAsset, Platform, Post } from "../model/types.ts";

/*
 * A transformer turns one Post from the common model into a draft for a target
 * platform. Drafts are what you'd hand to that platform's API or composer:
 * they respect its limits (length, media count, required fields), and every
 * lossy or judgement-call change is reported as a warning so nothing changes
 * silently.
 */

export interface TwitterDraft {
  platform: "twitter";
  /** One entry per tweet; more than one means a thread. */
  tweets: { text: string; mediaIds: string[] }[];
}

export interface RedditDraft {
  platform: "reddit";
  kind: "self" | "link" | "image" | "gallery" | "video";
  /** Without the `r/` prefix. Undefined means the user must pick one. */
  subreddit?: string;
  title: string;
  /** Markdown body (self posts, or the caption on media posts). */
  body?: string;
  url?: string;
  mediaIds: string[];
}

export interface InstagramDraft {
  platform: "instagram";
  kind: "single" | "carousel" | "reel";
  caption: string;
  mediaIds: string[];
  altText?: Record<string, string>;
}

export type Draft = TwitterDraft | RedditDraft | InstagramDraft;

export type TransformStatus =
  /** Valid for the target as-is. */
  | "ready"
  /** Valid, but a person should look (synthesized title, dropped tags, ...). */
  | "needs_review"
  /** Can't be expressed on the target (e.g. a text-only post on Instagram). */
  | "skipped";

export interface TransformResult<D extends Draft = Draft> {
  /** Ids of the common-model posts this draft came from (several for a merged thread). */
  postIds: string[];
  status: TransformStatus;
  draft?: D;
  warnings: string[];
  /** Why it was skipped. */
  reason?: string;
}

export interface TransformOptions {
  /** Subreddit to post to when the source post doesn't have one. */
  subreddit?: string;
  /** Append "(1/3)" style counters to tweet threads. Default true. */
  numberThreads?: boolean;
  /** Max hashtags carried to Twitter. Default 3 (hashtag walls read as spam there). */
  twitterMaxHashtags?: number;
  /** Add an "Originally posted on X · date" line. Default false. */
  attribution?: boolean;
  /** Include reposts of other people's content. Default false. */
  includeReposts?: boolean;
}

export interface TransformContext {
  bundle: Bundle;
  options: TransformOptions;
  media(id: string): MediaAsset | undefined;
}

export interface Transformer<D extends Draft = Draft> {
  target: Platform;
  transform(post: Post, ctx: TransformContext): TransformResult<D>;
}
