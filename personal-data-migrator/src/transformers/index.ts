import type { Bundle, Platform } from "../model/types.ts";
import { mergeThreads } from "./common.ts";
import { instagramTransformer } from "./instagram.ts";
import { redditTransformer } from "./reddit.ts";
import { twitterTransformer } from "./twitter.ts";
import type { Draft, TransformContext, TransformOptions, TransformResult, Transformer } from "./types.ts";

export const transformers: Record<Platform, Transformer> = {
  instagram: instagramTransformer,
  twitter: twitterTransformer,
  reddit: redditTransformer,
};

export interface MigrationPlan {
  bundleId: string;
  from: Platform;
  to: Platform;
  generatedAt: string;
  summary: Record<TransformResult["status"], number>;
  results: TransformResult<Draft>[];
}

/** Transform every post in a bundle for one target platform. */
export function transformBundle(
  bundle: Bundle,
  target: Platform,
  options: TransformOptions = {},
  now: Date = new Date(),
): MigrationPlan {
  const transformer = transformers[target];
  const ctx: TransformContext = { bundle, options, media: (id) => bundle.media[id] };
  const results = mergeThreads(bundle.posts).map(({ post, memberIds }) => ({
    ...transformer.transform(post, ctx),
    postIds: memberIds,
  }));
  const summary = { ready: 0, needs_review: 0, skipped: 0 };
  for (const r of results) summary[r.status]++;
  return {
    bundleId: bundle.id,
    from: bundle.source,
    to: target,
    generatedAt: now.toISOString(),
    summary,
    results,
  };
}

export type * from "./types.ts";
