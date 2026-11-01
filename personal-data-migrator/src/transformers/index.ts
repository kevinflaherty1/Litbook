import type { Bundle, Platform } from "../model/types.ts";
import { findingsByPost } from "../risk/scan.ts";
import type { Finding, RiskReport } from "../risk/types.ts";
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

function riskWarning(f: Finding): string {
  return `${f.severity}-risk ${f.label}: ${f.masked} (finding ${f.id})`;
}

/**
 * Transform every post in a bundle for one target platform. With a risk
 * report, posts carrying unacknowledged high-risk findings are blocked (no
 * draft text is emitted at all) unless `allowRisky` is set; medium findings
 * become warnings that force review.
 */
export function transformBundle(
  bundle: Bundle,
  target: Platform,
  options: TransformOptions = {},
  now: Date = new Date(),
  risk?: RiskReport,
): MigrationPlan {
  const transformer = transformers[target];
  const ctx: TransformContext = { bundle, options, media: (id) => bundle.media[id] };
  const byPost = risk ? findingsByPost(risk, bundle) : new Map<string, Finding[]>();

  const results = mergeThreads(bundle.posts).map(({ post, memberIds }): TransformResult<Draft> => {
    const result = { ...transformer.transform(post, ctx), postIds: memberIds };
    const findings = [
      ...new Map(memberIds.flatMap((id) => byPost.get(id) ?? []).map((f) => [f.id, f])).values(),
    ];
    if (!findings.length || result.status === "skipped") return result;

    const high = findings.filter((f) => f.severity === "high");
    const riskWarnings = findings.map(riskWarning);
    if (high.length && !options.allowRisky) {
      const labels = [...new Set(high.map((f) => f.label))].join(", ");
      return {
        postIds: memberIds,
        status: "blocked",
        warnings: riskWarnings,
        reason: `contains high-risk data (${labels}). Review with \`pdm scan\`, then acknowledge the finding or pass --allow-risky`,
      };
    }
    return { ...result, status: "needs_review", warnings: [...riskWarnings, ...result.warnings] };
  });

  const summary = { ready: 0, needs_review: 0, skipped: 0, blocked: 0 };
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
