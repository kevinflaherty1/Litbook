import { socialEntries } from "@/lib/social";

export type GuestAssets = {
  name: string;
  headline: string | null;
  pronouns: string | null;
  shortBio: string | null;
  longBio: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
};

function linksOf(g: GuestAssets) {
  const lines: string[] = [];
  if (g.websiteUrl) lines.push(`Website: ${g.websiteUrl}`);
  for (const s of socialEntries(g.socialLinks)) lines.push(`${s.label}: ${s.url ?? s.value}`);
  return lines;
}

function titleLine(g: GuestAssets) {
  return [g.name, g.headline].filter(Boolean).join(", ") + (g.pronouns ? ` (${g.pronouns})` : "");
}

/** Plain-text block for one guest, ready to paste into show notes. */
export function guestShowNotes(g: GuestAssets) {
  return [titleLine(g), g.shortBio, ...linksOf(g)].filter(Boolean).join("\n");
}

/** Plain-text show notes for every guest on an episode. */
export function episodeShowNotes(episodeTitle: string, guests: GuestAssets[]) {
  if (!guests.length) return "";
  const heading = guests.length === 1 ? `Guest on "${episodeTitle}"` : `Guests on "${episodeTitle}"`;
  return [heading, ...guests.map(guestShowNotes)].join("\n\n");
}

/** Markdown for the export ZIP: everything about each guest, including the long bio. */
export function guestsMarkdown(
  episodeTitle: string,
  guests: (GuestAssets & { headshotFile: string | null })[],
) {
  const sections = guests.map((g) => {
    const parts = [`## ${g.name}`];
    const meta = [
      g.headline && `**Headline:** ${g.headline}`,
      g.pronouns && `**Pronouns:** ${g.pronouns}`,
      g.headshotFile && `**Headshot:** ${g.headshotFile}`,
    ].filter(Boolean);
    if (meta.length) parts.push(meta.join("  \n"));
    if (g.shortBio) parts.push(`### Short bio\n\n${g.shortBio}`);
    if (g.longBio) parts.push(`### Long bio\n\n${g.longBio}`);
    const links = linksOf(g);
    if (links.length) parts.push(`### Links\n\n${links.map((l) => `- ${l}`).join("\n")}`);
    return parts.join("\n\n");
  });
  return [`# ${episodeTitle}: guests`, ...sections].join("\n\n") + "\n";
}

/** "Ada Lovelace" → "ada-lovelace", for file names. */
export function fileSlug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "guest"
  );
}
