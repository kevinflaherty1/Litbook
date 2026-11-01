import type { MediaAsset, Platform, Post } from "../model/types.ts";
import { markdownToPlain } from "./text.ts";
import type { TransformContext } from "./types.ts";

const NAMES: Record<Platform, string> = { instagram: "Instagram", twitter: "X/Twitter", reddit: "Reddit" };

/** Post body as plain text, whatever markup the source used. */
export function plainBody(post: Post): string {
  return post.source.platform === "reddit" ? markdownToPlain(post.text) : post.text;
}

/** Title as it should read off its home platform (drops r/EarthPorn-style "[4032x3024]" tags). */
export function portableTitle(post: Post): string | undefined {
  return post.title?.replace(/\s*[[(]\s*\d{3,5}\s*[x×]\s*\d{3,5}\s*[\])]/giu, "").trim() || undefined;
}

export function attributionLine(post: Post): string {
  const date = post.createdAt.slice(0, 10);
  return `Originally posted on ${NAMES[post.source.platform]} · ${date}`;
}

/**
 * Resolve a post's media and flag anything that can't be uploaded as-is.
 * Media that only exists as a remote URL is still returned (it can be fetched
 * before publishing) but is called out.
 */
export function resolveMedia(post: Post, ctx: TransformContext, warnings: string[]): MediaAsset[] {
  const out: MediaAsset[] = [];
  for (const id of post.mediaIds) {
    const asset = ctx.media(id);
    if (!asset) {
      warnings.push(`media ${id} missing from bundle, dropped`);
      continue;
    }
    if (!asset.path && !asset.remoteUrl) {
      warnings.push(`media ${id} has no file or URL, dropped`);
      continue;
    }
    if (!asset.path)
      warnings.push(`media ${id} is not stored locally yet; download ${asset.remoteUrl} before publishing`);
    out.push(asset);
  }
  return out;
}

/** Mentions are platform-local: @alice on Instagram isn't necessarily @alice on X. */
export function mentionWarning(post: Post, target: Platform): string | undefined {
  if (post.source.platform === target || post.entities.mentions.length === 0) return undefined;
  const list = post.entities.mentions.map((m) => `@${m}`).join(", ");
  return `mentions ${list} are ${NAMES[post.source.platform]} accounts and may be different people on ${NAMES[target]}`;
}

/**
 * Collapse self-reply threads into one logical post so that a 5-tweet thread
 * becomes one Reddit post or one Instagram caption rather than five.
 */
export function mergeThreads(posts: Post[]): { post: Post; memberIds: string[] }[] {
  const out: { post: Post; memberIds: string[] }[] = [];
  const threads = new Map<string, { post: Post; memberIds: string[] }>();
  for (const p of [...posts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!p.threadId) {
      out.push({ post: p, memberIds: [p.id] });
      continue;
    }
    const existing = threads.get(p.threadId);
    if (!existing) {
      const entry = { post: { ...p, mediaIds: [...p.mediaIds] }, memberIds: [p.id] };
      threads.set(p.threadId, entry);
      out.push(entry);
      continue;
    }
    const merged = existing.post;
    merged.text = `${merged.text}\n\n${p.text}`;
    merged.mediaIds.push(...p.mediaIds);
    merged.entities = {
      hashtags: [...new Set([...merged.entities.hashtags, ...p.entities.hashtags])],
      mentions: [...new Set([...merged.entities.mentions, ...p.entities.mentions])],
      urls: [...new Set([...merged.entities.urls, ...p.entities.urls])],
    };
    merged.linkUrl = undefined;
    existing.memberIds.push(p.id);
  }
  return out;
}
