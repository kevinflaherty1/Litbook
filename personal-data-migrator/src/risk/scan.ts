import { createHash, createHmac } from "node:crypto";
import type { Bundle, MediaAsset } from "../model/types.ts";
import { findMatches, type TextMatch } from "./detectors.ts";
import { mediaHasLocation } from "./media.ts";
import { SEVERITY_RANK, type Excerpt, type Finding, type RiskLocation, type RiskReport } from "./types.ts";

export interface ScanOptions {
  /** Per-vault secret for fingerprints. Never written into reports. */
  key: Buffer;
  /** Absolute path of a stored media file, if it's on disk. */
  mediaFile: (asset: MediaAsset) => string | undefined;
  /** Finding ids the user has reviewed and accepted. */
  acknowledged?: ReadonlySet<string>;
  now?: Date;
}

const EXCERPT_RADIUS = 40;

function fingerprint(key: Buffer, detector: string, normalized: string): string {
  return createHmac("sha256", key).update(`${detector}\0${normalized}`).digest("hex").slice(0, 20);
}

function findingId(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 12);
}

const squash = (s: string) => s.replace(/\s+/g, " ");

/**
 * Context around `target` with EVERY sensitive match in the window replaced by
 * its mask. The window is widened to swallow any match it would otherwise cut
 * in half, so a partial secret can't leak through the edge of an excerpt.
 */
export function buildExcerpt(text: string, matches: TextMatch[], target: TextMatch): Excerpt {
  let start = Math.max(0, target.start - EXCERPT_RADIUS);
  let end = Math.min(text.length, target.end + EXCERPT_RADIUS);
  for (const m of matches) {
    if (m.start < start && m.end > start) start = m.start;
    if (m.start < end && m.end > end) end = m.end;
  }
  const render = (from: number, to: number): string => {
    let out = "";
    let cursor = from;
    for (const m of matches) {
      if (m === target || m.end <= from || m.start >= to) continue;
      out += text.slice(cursor, m.start) + `⟦${m.detector.mask(m.value)}⟧`;
      cursor = m.end;
    }
    return out + text.slice(cursor, to);
  };
  return {
    before: (start > 0 ? "…" : "") + squash(render(start, target.start)).trimStart(),
    match: target.detector.mask(target.value),
    after: squash(render(target.end, end)).trimEnd() + (end < text.length ? "…" : ""),
  };
}

/** Scan a stored bundle. Returns findings that contain no raw sensitive values. */
export async function scanBundle(bundle: Bundle, opts: ScanOptions): Promise<RiskReport> {
  const findings: Finding[] = [];
  const acked = opts.acknowledged ?? new Set<string>();

  const push = (f: Omit<Finding, "id" | "acknowledged">, idParts: string[]) => {
    const id = findingId([
      bundle.id,
      f.detector,
      f.location.record,
      f.location.recordId,
      f.location.field,
      ...idParts,
    ]);
    findings.push({ id, ...f, ...(acked.has(id) ? { acknowledged: true } : {}) });
  };

  const scanText = (text: string | undefined, location: RiskLocation) => {
    if (!text) return;
    const matches = findMatches(text);
    const seen = new Map<string, number>();
    for (const m of matches) {
      const d = m.detector;
      const fp = fingerprint(opts.key, d.id, d.normalize ? d.normalize(m.value) : m.value);
      const nth = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, nth);
      push(
        {
          detector: d.id,
          label: d.label,
          category: d.category,
          severity: d.severity,
          location,
          masked: d.mask(m.value),
          excerpt: buildExcerpt(text, matches, m),
          fingerprint: fp,
          advice: d.advice,
        },
        [fp, String(nth)],
      );
    }
  };

  const { profile } = bundle;
  for (const field of ["displayName", "bio", "website"] as const) {
    scanText(profile[field], { record: "profile", recordId: profile.handle, field });
  }

  for (const post of bundle.posts) {
    const at = { record: "post" as const, recordId: post.id, createdAt: post.createdAt };
    scanText(post.title, { ...at, field: "title" });
    scanText(post.text, { ...at, field: "text" });
    scanText(post.linkUrl, { ...at, field: "linkUrl" });
    if (post.location?.latitude !== undefined && post.location.longitude !== undefined) {
      push(
        {
          detector: "tagged_location",
          label: "precise location tag",
          category: "location",
          severity: "medium",
          location: { ...at, field: "location" },
          masked: post.location.name
            ? `tagged “${post.location.name}” (coordinates redacted)`
            : "coordinates redacted",
          advice:
            "The post carries exact coordinates. Drafts never include them, but check the place isn't your home.",
        },
        [],
      );
    }
    if (post.visibility === "private" || post.visibility === "followers") {
      push(
        {
          detector: "non_public_post",
          label: `${post.visibility}-only post`,
          category: "privacy",
          severity: "high",
          location: { ...at, field: "visibility" },
          masked: `visible to ${post.visibility} only`,
          advice: "This was not public. Re-posting it on another platform would make it public.",
        },
        [],
      );
    }
    for (const mediaId of post.mediaIds) {
      const asset = bundle.media[mediaId];
      scanText(asset?.altText, {
        record: "media",
        recordId: mediaId,
        field: "altText",
        createdAt: post.createdAt,
      });
    }
  }

  for (const c of bundle.comments) {
    scanText(c.text, { record: "comment", recordId: c.id, field: "text", createdAt: c.createdAt });
  }
  // Saved/liked links can carry tokens (e.g. a bookmarked password-reset link).
  for (const item of bundle.saved ?? []) {
    scanText(item.source.url, { record: "saved", recordId: item.id, field: "url", createdAt: item.savedAt });
  }

  for (const asset of Object.values(bundle.media)) {
    const file = opts.mediaFile(asset);
    if (!file) continue;
    let located = false;
    try {
      located = await mediaHasLocation(file, asset.kind, asset.mimeType);
    } catch {
      continue; // unreadable media isn't a finding; import already warned about missing files
    }
    if (located) {
      push(
        {
          detector: "media_gps",
          label: "GPS location in file metadata",
          category: "location",
          severity: "high",
          location: { record: "media", recordId: asset.id, field: "metadata" },
          masked: `${asset.kind} with embedded GPS coordinates (not extracted)`,
          advice: "Strip metadata before uploading this file anywhere that doesn't remove it for you.",
        },
        [],
      );
    }
  }

  for (const f of bundle.sensitiveExportFiles ?? []) {
    push(
      {
        detector: "sensitive_export_file",
        label: f.kind,
        category: f.kind.includes("message") ? "private_messages" : "personal",
        severity: f.severity,
        location: { record: "export_file", recordId: f.path, field: "file" },
        masked: f.fileCount > 1 ? `${f.fileCount} files, e.g. ${f.path}` : f.path,
        advice:
          "Not imported, but it's still in the export you downloaded. Delete the export zip and folder once you've imported it.",
      },
      [],
    );
  }

  findings.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (a.location.createdAt ?? "").localeCompare(b.location.createdAt ?? ""),
  );
  const summary = { high: 0, medium: 0, low: 0 };
  for (const f of findings) if (!f.acknowledged) summary[f.severity]++;
  return { bundleId: bundle.id, scannedAt: (opts.now ?? new Date()).toISOString(), summary, findings };
}

/** Unacknowledged findings per post id, for gating transforms. */
export function findingsByPost(report: RiskReport, bundle: Bundle): Map<string, Finding[]> {
  const mediaToPosts = new Map<string, string[]>();
  for (const p of bundle.posts)
    for (const m of p.mediaIds) mediaToPosts.set(m, [...(mediaToPosts.get(m) ?? []), p.id]);
  const out = new Map<string, Finding[]>();
  const add = (postId: string, f: Finding) => out.set(postId, [...(out.get(postId) ?? []), f]);
  for (const f of report.findings) {
    if (f.acknowledged) continue;
    if (f.location.record === "post") add(f.location.recordId, f);
    else if (f.location.record === "media")
      for (const p of mediaToPosts.get(f.location.recordId) ?? []) add(p, f);
  }
  return out;
}
