import type { Post } from "../model/types.ts";
import { attributionLine, mentionWarning, plainBody, resolveMedia } from "./common.ts";
import { firstSentence, plainToMarkdown, splitTrailingHashtags, truncate } from "./text.ts";
import type { RedditDraft, TransformContext, TransformResult, Transformer } from "./types.ts";

export const REDDIT_LIMITS = {
  titleMax: 300,
  bodyMax: 40_000,
  galleryMax: 20,
} as const;

export const redditTransformer: Transformer<RedditDraft> = {
  target: "reddit",

  transform(post: Post, ctx: TransformContext): TransformResult<RedditDraft> {
    const warnings: string[] = [];
    const opts = ctx.options;
    if (post.relation?.kind === "repost" && !opts.includeReposts) {
      return { postIds: [post.id], status: "skipped", warnings, reason: "repost of someone else's content" };
    }

    // Body: Reddit sources keep their markdown; others are plain text that must be escaped.
    const fromReddit = post.source.platform === "reddit";
    const { body: plain, tags } = splitTrailingHashtags(fromReddit ? post.text : plainBody(post));
    if (tags.length && !fromReddit)
      warnings.push(`dropped ${tags.length} trailing hashtags (they do nothing on Reddit)`);

    // Title: Reddit requires one. Synthesize from the first sentence if the source had none.
    let title = post.title?.trim() ?? "";
    let remainder = plain;
    if (!title) {
      const first = firstSentence(plain);
      if (first) {
        title = first;
        warnings.push("title generated from the first sentence");
        const rest = plain
          .trim()
          .slice(plain.trim().indexOf(first) + first.length)
          .trim();
        remainder = rest;
      } else {
        title = `Post from ${post.createdAt.slice(0, 10)}`;
        warnings.push("no text to build a title from; placeholder title used");
      }
    }
    if ([...title].length > REDDIT_LIMITS.titleMax) {
      // Keep what we cut in the body rather than losing it.
      remainder = [title, remainder].filter(Boolean).join("\n\n");
      title = truncate(title, REDDIT_LIMITS.titleMax);
      warnings.push(`title truncated to ${REDDIT_LIMITS.titleMax} characters (full text kept in body)`);
    }

    let body = fromReddit ? remainder : plainToMarkdown(remainder);
    if (opts.attribution) body = [body, `^(${attributionLine(post)})`].filter(Boolean).join("\n\n");
    if (body.length > REDDIT_LIMITS.bodyMax) {
      body = truncate(body, REDDIT_LIMITS.bodyMax);
      warnings.push(`body truncated to ${REDDIT_LIMITS.bodyMax} characters`);
    }
    const mention = mentionWarning(post, "reddit");
    if (mention) warnings.push(mention);

    // Kind is decided by media.
    const assets = resolveMedia(post, ctx, warnings);
    const images = assets.filter((a) => a.kind === "image" || a.kind === "gif");
    const videos = assets.filter((a) => a.kind === "video");
    let kind: RedditDraft["kind"];
    let mediaIds: string[] = [];
    if (videos.length && images.length === 0) {
      kind = "video";
      mediaIds = [videos[0]!.id];
      if (videos.length > 1) warnings.push(`Reddit posts hold one video; ${videos.length - 1} dropped`);
    } else if (images.length) {
      kind = images.length === 1 ? "image" : "gallery";
      mediaIds = images.slice(0, REDDIT_LIMITS.galleryMax).map((a) => a.id);
      if (images.length > REDDIT_LIMITS.galleryMax)
        warnings.push(`gallery limited to ${REDDIT_LIMITS.galleryMax} images`);
      if (videos.length) warnings.push(`${videos.length} video(s) dropped: Reddit galleries are images only`);
    } else {
      kind = post.linkUrl ? "link" : "self";
    }

    const subreddit = (fromReddit ? post.community : undefined) ?? opts.subreddit;
    if (!subreddit) warnings.push("no subreddit chosen (pass --subreddit)");

    if (kind === "self" && !post.text.trim() && !post.title) {
      return { postIds: [post.id], status: "skipped", warnings, reason: "post has no text or usable media" };
    }
    return {
      postIds: [post.id],
      status: warnings.length ? "needs_review" : "ready",
      draft: {
        platform: "reddit",
        kind,
        subreddit,
        title,
        body: body || undefined,
        url: kind === "link" ? post.linkUrl : undefined,
        mediaIds,
      },
      warnings,
    };
  },
};
