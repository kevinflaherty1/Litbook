import type { Post } from "../model/types.ts";
import { attributionLine, mentionWarning, plainBody, portableTitle, resolveMedia } from "./common.ts";
import { splitTrailingHashtags, truncate } from "./text.ts";
import type { InstagramDraft, TransformContext, TransformResult, Transformer } from "./types.ts";

export const INSTAGRAM_LIMITS = {
  captionMax: 2200,
  /** Instagram cut the per-post hashtag cap from 30 to 5 in Dec 2025. */
  hashtagsMax: 5,
  carouselMax: 20,
} as const;

export const instagramTransformer: Transformer<InstagramDraft> = {
  target: "instagram",

  transform(post: Post, ctx: TransformContext): TransformResult<InstagramDraft> {
    const warnings: string[] = [];
    const opts = ctx.options;
    if (post.relation?.kind === "repost" && !opts.includeReposts) {
      return { postIds: [post.id], status: "skipped", warnings, reason: "repost of someone else's content" };
    }

    const assets = resolveMedia(post, ctx, warnings).filter((a) => {
      if (a.kind === "audio") warnings.push(`audio ${a.id} can't be posted on its own, dropped`);
      if (a.kind === "gif") warnings.push(`GIF ${a.id} must be converted to MP4 before upload`);
      return a.kind !== "audio";
    });
    if (assets.length === 0) {
      return {
        postIds: [post.id],
        status: "skipped",
        warnings,
        reason: "Instagram posts need at least one photo or video",
      };
    }

    let mediaIds = assets.map((a) => a.id);
    if (mediaIds.length > INSTAGRAM_LIMITS.carouselMax) {
      warnings.push(
        `carousel limited to ${INSTAGRAM_LIMITS.carouselMax} items; ${mediaIds.length - INSTAGRAM_LIMITS.carouselMax} dropped`,
      );
      mediaIds = mediaIds.slice(0, INSTAGRAM_LIMITS.carouselMax);
    }
    const first = assets[0]!;
    const kind: InstagramDraft["kind"] =
      mediaIds.length > 1 ? "carousel" : first.kind === "video" ? "reel" : "single";

    // Caption: title + body, hashtags capped, links spelled out (they aren't clickable).
    let text = plainBody(post);
    const title = portableTitle(post);
    if (title) text = text ? `${title}\n\n${text}` : title;
    const { body, tags: trailing } = splitTrailingHashtags(text);
    const inline = post.entities.hashtags.filter((t) => body.toLowerCase().includes(`#${t.toLowerCase()}`));
    const budget = Math.max(0, INSTAGRAM_LIMITS.hashtagsMax - inline.length);
    const keptTags = trailing.slice(0, budget);
    if (keptTags.length < trailing.length) {
      warnings.push(
        `kept ${keptTags.length} of ${trailing.length} trailing hashtags (Instagram allows ${INSTAGRAM_LIMITS.hashtagsMax})`,
      );
    }
    if (inline.length > INSTAGRAM_LIMITS.hashtagsMax) {
      warnings.push(
        `caption has ${inline.length} inline hashtags; Instagram allows ${INSTAGRAM_LIMITS.hashtagsMax}`,
      );
    }

    const parts = [body];
    if (post.linkUrl) {
      parts.push(`🔗 ${post.linkUrl}`);
      warnings.push("links in captions aren't clickable on Instagram");
    }
    if (opts.attribution) parts.push(attributionLine(post));
    if (keptTags.length) parts.push(keptTags.map((t) => `#${t}`).join(" "));
    let caption = parts.filter(Boolean).join("\n\n");
    if ([...caption].length > INSTAGRAM_LIMITS.captionMax) {
      caption = truncate(caption, INSTAGRAM_LIMITS.captionMax);
      warnings.push(`caption truncated to ${INSTAGRAM_LIMITS.captionMax} characters`);
    }
    const mention = mentionWarning(post, "instagram");
    if (mention) warnings.push(mention);

    const altText = Object.fromEntries(
      assets.filter((a) => a.altText && mediaIds.includes(a.id)).map((a) => [a.id, a.altText!]),
    );
    return {
      postIds: [post.id],
      status: warnings.length ? "needs_review" : "ready",
      draft: {
        platform: "instagram",
        kind,
        caption,
        mediaIds,
        altText: Object.keys(altText).length ? altText : undefined,
      },
      warnings,
    };
  },
};
