import type { MediaAsset, Post } from "../model/types.ts";
import { attributionLine, mentionWarning, plainBody, portableTitle, resolveMedia } from "./common.ts";
import { splitTrailingHashtags, truncate, tweetLength } from "./text.ts";
import type { TransformContext, TransformResult, Transformer, TwitterDraft } from "./types.ts";

export const TWITTER_LIMITS = {
  maxLength: 280,
  imagesPerTweet: 4,
  /** Videos and GIFs can't share a tweet with anything else. */
  videosPerTweet: 1,
  maxThreadLength: 25,
} as const;

/** Greedy word-packing into tweets, reserving room for a " 10/12" counter. */
export function splitIntoTweets(text: string, numbered: boolean): string[] {
  const reserve = numbered ? 7 : 0;
  const budget = TWITTER_LIMITS.maxLength - reserve;
  if (tweetLength(text) <= TWITTER_LIMITS.maxLength) return [text];

  const chunks: string[] = [];
  let current = "";
  // Paragraph breaks are good split points; keep them as tokens.
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    const candidate = current + token;
    if (tweetLength(candidate.trimEnd()) <= budget) {
      current = candidate;
      continue;
    }
    if (current.trim()) chunks.push(current.trim());
    current = /^\s+$/.test(token) ? "" : token;
    // One word longer than a whole tweet: hard-cut it.
    while (tweetLength(current) > budget) {
      const head = truncate(current, budget, tweetLength).replace(/…$/, "");
      chunks.push(head);
      current = current.slice(head.length);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function packMedia(assets: MediaAsset[]): string[][] {
  const groups: string[][] = [];
  let images: string[] = [];
  for (const a of assets) {
    if (a.kind === "image") {
      images.push(a.id);
      if (images.length === TWITTER_LIMITS.imagesPerTweet) {
        groups.push(images);
        images = [];
      }
    } else {
      groups.push([a.id]);
    }
  }
  if (images.length) groups.push(images);
  return groups;
}

export const twitterTransformer: Transformer<TwitterDraft> = {
  target: "twitter",

  transform(post: Post, ctx: TransformContext): TransformResult<TwitterDraft> {
    const warnings: string[] = [];
    const opts = ctx.options;
    if (post.relation?.kind === "repost" && !opts.includeReposts) {
      return { postIds: [post.id], status: "skipped", warnings, reason: "repost of someone else's content" };
    }

    let body = plainBody(post);
    const title = portableTitle(post);
    if (title) body = body ? `${title}\n\n${body}` : title;

    // Hashtag walls read as spam on X; keep the first few.
    const { body: withoutWall, tags } = splitTrailingHashtags(body);
    const maxTags = opts.twitterMaxHashtags ?? 3;
    const kept = tags.slice(0, maxTags);
    if (tags.length > kept.length)
      warnings.push(`dropped ${tags.length - kept.length} of ${tags.length} trailing hashtags`);
    body = [withoutWall, kept.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");

    if (post.linkUrl && !body.includes(post.linkUrl))
      body = [body, post.linkUrl].filter(Boolean).join("\n\n");
    if (post.community && post.source.platform === "reddit")
      warnings.push(`posted in r/${post.community}; that context is lost`);
    if (opts.attribution) body = [body, attributionLine(post)].filter(Boolean).join("\n\n");
    const mention = mentionWarning(post, "twitter");
    if (mention) warnings.push(mention);

    const assets = resolveMedia(post, ctx, warnings).filter((a) => {
      if (a.kind === "audio") warnings.push(`audio ${a.id} can't be attached to a tweet, dropped`);
      return a.kind !== "audio";
    });
    const mediaGroups = packMedia(assets);

    const numbered = opts.numberThreads ?? true;
    const texts = body ? splitIntoTweets(body, numbered) : [];
    const count = Math.max(texts.length, mediaGroups.length, 1);
    if (count > 1 && texts.length > 1) warnings.push(`split into a ${count}-tweet thread`);
    if (mediaGroups.length > 1)
      warnings.push(`${assets.length} media items spread across ${mediaGroups.length} tweets`);
    if (count > TWITTER_LIMITS.maxThreadLength)
      warnings.push(`thread has ${count} tweets; consider trimming`);

    const tweets: TwitterDraft["tweets"] = [];
    for (let i = 0; i < count; i++) {
      let text = texts[i] ?? "";
      if (numbered && count > 1) text = `${text} ${i + 1}/${count}`.trim();
      tweets.push({ text, mediaIds: mediaGroups[i] ?? [] });
    }

    if (!body && assets.length === 0) {
      return { postIds: [post.id], status: "skipped", warnings, reason: "post has no text or usable media" };
    }
    return {
      postIds: [post.id],
      status: warnings.length ? "needs_review" : "ready",
      draft: { platform: "twitter", tweets },
      warnings,
    };
  },
};
