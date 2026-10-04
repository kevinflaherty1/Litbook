import { describe, expect, it } from "vitest";

import { episodeShowNotes, fileSlug, guestShowNotes, guestsMarkdown } from "@/lib/show-notes";
import { socialUrl } from "@/lib/social";

describe("socialUrl", () => {
  it.each([
    ["x", "@ada", "https://x.com/ada"],
    ["instagram", "ada.codes", "https://www.instagram.com/ada.codes"],
    ["tiktok", "@ada", "https://www.tiktok.com/@ada"],
    ["youtube", "@AdaTalks", "https://www.youtube.com/@AdaTalks"],
    ["linkedin", "linkedin.com/in/ada", "https://linkedin.com/in/ada"],
    ["bluesky", "ada.bsky.social", "https://bsky.app/profile/ada.bsky.social"],
    ["x", "https://twitter.com/ada", "https://twitter.com/ada"],
  ])("%s %j → %s", (platform, value, expected) => {
    expect(socialUrl(platform, value)).toBe(expected);
  });

  it.each([
    ["x", "javascript:alert(1)"],
    ["x", "has space"],
    ["x", "<script>"],
    ["unknown", "@ada"],
    ["x", ""],
  ])("rejects %s %j", (platform, value) => {
    expect(socialUrl(platform, value)).toBeNull();
  });
});

const ada = {
  name: "Ada Lovelace",
  headline: "Countess of Lovelace",
  pronouns: "she/her",
  shortBio: "First programmer.",
  longBio: "A much longer bio.",
  websiteUrl: "https://ada.dev",
  socialLinks: { x: "@ada" },
};

describe("show notes", () => {
  it("formats one guest", () => {
    expect(guestShowNotes(ada)).toBe(
      "Ada Lovelace, Countess of Lovelace (she/her)\nFirst programmer.\nWebsite: https://ada.dev\nX / Twitter: https://x.com/ada",
    );
  });

  it("skips missing fields", () => {
    expect(
      guestShowNotes({ ...ada, headline: null, pronouns: null, websiteUrl: null, socialLinks: {} }),
    ).toBe("Ada Lovelace\nFirst programmer.");
  });

  it("formats an episode", () => {
    const grace = { ...ada, name: "Grace Hopper", headline: null, pronouns: null };
    const notes = episodeShowNotes("Computing", [ada, grace]);
    expect(notes.startsWith('Guests on "Computing"\n\nAda Lovelace')).toBe(true);
    expect(notes).toContain("\n\nGrace Hopper\n");
    expect(episodeShowNotes("Computing", [])).toBe("");
  });

  it("builds guests.md with long bios and headshot file names", () => {
    const md = guestsMarkdown("Computing", [{ ...ada, headshotFile: "ada-lovelace.jpg" }]);
    expect(md).toContain("# Computing: guests");
    expect(md).toContain("**Headshot:** ada-lovelace.jpg");
    expect(md).toContain("### Long bio\n\nA much longer bio.");
    expect(md).toContain("- X / Twitter: https://x.com/ada");
  });

  it("makes safe file names", () => {
    expect(fileSlug("Zoë O'Brien-Smith")).toBe("zoe-o-brien-smith");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(fileSlug("漢字")).toBe("guest");
  });
});
