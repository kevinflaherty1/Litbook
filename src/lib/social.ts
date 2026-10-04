import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/schemas/portal";

const PROFILE_URL: Record<SocialPlatform, (handle: string) => string> = {
  x: (h) => `https://x.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  bluesky: (h) => `https://bsky.app/profile/${h}`,
};

/**
 * Turns what a guest typed ("@ada", "x.com/ada", "https://…") into a profile
 * URL. Only ever returns http(s) URLs; returns null for anything unusable.
 */
export function socialUrl(platform: string, value: string): string | null {
  const v = value.trim();
  if (!v || /\s/.test(v)) return null;

  const looksLikeUrl = /^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+\//.test(v);
  if (looksLikeUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  const handle = v.replace(/^@/, "");
  if (!/^[\w.-]+$/.test(handle) || !(platform in PROFILE_URL)) return null;
  return PROFILE_URL[platform as SocialPlatform](encodeURIComponent(handle));
}

export function socialLabel(platform: string) {
  return SOCIAL_PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
}

/** Social links in a stable order, with their resolved URLs. */
export function socialEntries(links: Record<string, string>) {
  return SOCIAL_PLATFORMS.filter((p) => links[p.key]).map((p) => ({
    key: p.key,
    label: p.label,
    value: links[p.key],
    url: socialUrl(p.key, links[p.key]),
  }));
}
