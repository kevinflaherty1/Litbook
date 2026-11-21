// Parse the response of Instagram's web endpoint /api/v1/media/<id>/info/
// into the few fields the pipeline needs. The endpoint is undocumented, so
// every field is read defensively and anything unexpected becomes an error
// message on the item rather than a crash.

export type MediaPart =
  | { kind: "video"; url: string; width: number; height: number; durationSec: number | null }
  | { kind: "image"; url: string; width: number; height: number };

export type MediaInfo = {
  mediaId: string;
  shortcode: string | null;
  author: string | null;
  caption: string | null;
  takenAt: number | null;
  parts: MediaPart[];
};

type Rendition = { url: string; width: number; height: number };

const MEDIA_IMAGE = 1;
const MEDIA_VIDEO = 2;
const MEDIA_CAROUSEL = 8;

/** Short side (px) the OCR pass wants: big enough for small captions, small enough to download fast. */
export const TARGET_SHORT_SIDE = 720;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function renditions(v: unknown): Rendition[] {
  if (!Array.isArray(v)) return [];
  const out: Rendition[] = [];
  for (const r of v) {
    const rec = asRecord(r);
    if (!rec || typeof rec.url !== "string") continue;
    out.push({
      url: rec.url,
      width: typeof rec.width === "number" ? rec.width : 0,
      height: typeof rec.height === "number" ? rec.height : 0,
    });
  }
  return out;
}

/** The rendition whose short side is closest to the target, preferring larger on ties. */
export function pickRendition<T extends Rendition>(list: T[], target = TARGET_SHORT_SIDE): T | null {
  if (list.length === 0) return null;
  const score = (r: T) => Math.abs(Math.min(r.width, r.height) - target);
  return [...list].sort((a, b) => score(a) - score(b) || b.width - a.width)[0];
}

function partOf(node: Record<string, unknown>): MediaPart | null {
  const type = node.media_type;
  if (type === MEDIA_VIDEO) {
    const best = pickRendition(renditions(node.video_versions));
    if (!best) return null;
    const duration = typeof node.video_duration === "number" ? node.video_duration : null;
    return { kind: "video", ...best, durationSec: duration };
  }
  if (type === MEDIA_IMAGE) {
    const candidates = renditions(asRecord(node.image_versions2)?.candidates);
    // For still images take the largest: OCR on photos of text benefits from resolution.
    const best = [...candidates].sort((a, b) => b.width - a.width)[0];
    return best ? { kind: "image", ...best } : null;
  }
  return null;
}

export class MediaInfoError extends Error {}

export function parseMediaInfo(json: unknown): MediaInfo {
  const root = asRecord(json);
  if (!root) throw new MediaInfoError("Response was not a JSON object");
  if (root.status === "fail" || root.require_login) {
    throw new MediaInfoError(String(root.message ?? "Instagram refused the request (login required?)"));
  }
  const items = Array.isArray(root.items) ? root.items : [];
  const item = asRecord(items[0]);
  if (!item) throw new MediaInfoError("Response had no media item");

  const parts: MediaPart[] = [];
  if (item.media_type === MEDIA_CAROUSEL && Array.isArray(item.carousel_media)) {
    for (const child of item.carousel_media) {
      const rec = asRecord(child);
      const part = rec && partOf(rec);
      if (part) parts.push(part);
    }
  } else {
    const part = partOf(item);
    if (part) parts.push(part);
  }

  const caption = asRecord(item.caption);
  const user = asRecord(item.user);
  return {
    mediaId: String(item.pk ?? item.id ?? ""),
    shortcode: typeof item.code === "string" ? item.code : null,
    author: typeof user?.username === "string" ? user.username : null,
    caption: typeof caption?.text === "string" ? caption.text : null,
    takenAt: typeof item.taken_at === "number" ? item.taken_at : null,
    parts,
  };
}
