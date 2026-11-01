import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importers } from "../src/importers/index.ts";
import { extractEntities } from "../src/model/text.ts";
import type { Bundle, MediaAsset, Platform, Post } from "../src/model/types.ts";
import {
  transformBundle,
  type InstagramDraft,
  type RedditDraft,
  type TwitterDraft,
} from "../src/transformers/index.ts";
import { tweetLength } from "../src/transformers/text.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function load(p: Platform): Promise<Bundle> {
  const imported = await importers[p].import(fixture(p));
  return { ...imported, id: `test-${p}`, importedAt: "2026-01-01T00:00:00.000Z" };
}

/** Build a one-post bundle for focused limit tests. */
function single(post: Partial<Post>, media: MediaAsset[] = [], source: Platform = "instagram"): Bundle {
  const text = post.text ?? "";
  return {
    schemaVersion: 1,
    id: "t",
    source,
    importedAt: "2026-01-01T00:00:00.000Z",
    profile: { platform: source, handle: "me" },
    posts: [
      {
        id: "p1",
        source: { platform: source },
        createdAt: "2024-01-01T00:00:00.000Z",
        entities: extractEntities(text),
        mediaIds: media.map((m) => m.id),
        visibility: "public",
        engagement: {},
        ...post,
        text,
      },
    ],
    comments: [],
    connections: [],
    media: Object.fromEntries(media.map((m) => [m.id, m])),
    importWarnings: [],
  };
}

const img = (n: number): MediaAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `sha256:${i}`,
    kind: "image" as const,
    path: `media/${i}.jpg`,
  }));

describe("→ twitter", () => {
  it("splits long text into a numbered thread where every tweet fits", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about the trail.`).join(" ");
    const [r] = transformBundle(single({ text }), "twitter").results;
    const tweets = (r!.draft as TwitterDraft).tweets;
    assert.ok(tweets.length > 1);
    for (const [i, t] of tweets.entries()) {
      assert.ok(tweetLength(t.text) <= 280, `tweet ${i} is ${tweetLength(t.text)}`);
      assert.ok(t.text.endsWith(`${i + 1}/${tweets.length}`));
    }
    // No words lost or reordered.
    const rejoined = tweets.map((t) => t.text.replace(/ \d+\/\d+$/, "")).join(" ");
    assert.equal(rejoined, text);
  });

  it("puts at most 4 images per tweet and gives videos their own tweet", () => {
    const media = [...img(5), { id: "sha256:v", kind: "video" as const, path: "media/v.mp4" }];
    const [r] = transformBundle(single({ text: "Trip photos" }, media), "twitter").results;
    const tweets = (r!.draft as TwitterDraft).tweets;
    assert.deepEqual(
      tweets.map((t) => t.mediaIds.length),
      [4, 1, 1],
    );
    assert.deepEqual(tweets[1]!.mediaIds, ["sha256:v"]);
  });

  it("counts URLs as 23 and CJK/emoji as 2", () => {
    assert.equal(tweetLength(`see https://example.com/${"x".repeat(100)}`), 4 + 23);
    assert.equal(tweetLength("日本"), 4);
    assert.equal(tweetLength("👍🏽"), 2);
  });

  it("trims an Instagram hashtag wall to 3 tags", async () => {
    const plan = transformBundle(await load("instagram"), "twitter");
    const text = (plan.results[0]!.draft as TwitterDraft).tweets[0]!.text;
    assert.match(text, /#hiking #sunrise #mountains$/);
    assert.doesNotMatch(text, /#wanderlust/);
  });

  it("skips reposts unless asked", async () => {
    const b = await load("twitter");
    assert.equal(
      transformBundle(b, "reddit").results.find((r) => r.postIds[0] === "twitter:post:1004")!.status,
      "skipped",
    );
    const withReposts = transformBundle(b, "reddit", { includeReposts: true });
    assert.notEqual(withReposts.results.find((r) => r.postIds[0] === "twitter:post:1004")!.status, "skipped");
  });

  it("flattens Reddit markdown", async () => {
    const plan = transformBundle(await load("reddit"), "twitter");
    const text = (plan.results[0]!.draft as TwitterDraft).tweets.map((t) => t.text).join(" ");
    assert.match(text, /• Bring more water than you think/);
    assert.match(text, /good headlamp \(https:\/\/example\.com\/lamp\)/);
    assert.doesNotMatch(text, /\*\*/);
  });
});

describe("→ reddit", () => {
  it("merges a tweet thread into one post with a generated title", async () => {
    const plan = transformBundle(await load("twitter"), "reddit", { subreddit: "PacificCrestTrail" });
    const thread = plan.results[0]!;
    assert.deepEqual(thread.postIds, ["twitter:post:1001", "twitter:post:1002"]);
    const d = thread.draft as RedditDraft;
    assert.equal(d.kind, "image");
    assert.equal(d.subreddit, "PacificCrestTrail");
    assert.match(d.title, /^Big news: I'm walking the whole Pacific Crest Trail/);
    assert.match(d.body!, /Gear list is up on the blog/);
    assert.equal(thread.status, "needs_review");
    assert.ok(thread.warnings.includes("title generated from the first sentence"));
  });

  it("escapes text so a leading #hashtag doesn't become a heading", () => {
    const [r] = transformBundle(single({ text: "Title line.\n#notaheading here" }), "reddit", {
      subreddit: "x",
    }).results;
    assert.match((r!.draft as RedditDraft).body!, /^\\#notaheading/m);
  });

  it("makes a gallery from a carousel and reports dropped video", async () => {
    const plan = transformBundle(await load("instagram"), "reddit", { subreddit: "hiking" });
    const r = plan.results[1]!;
    assert.equal((r.draft as RedditDraft).kind, "gallery");
    assert.equal((r.draft as RedditDraft).mediaIds.length, 2);
    assert.ok(r.warnings.some((w) => w.includes("video(s) dropped")));
  });

  it("asks for a subreddit when the source had none", () => {
    const [r] = transformBundle(single({ text: "Hello world." }), "reddit").results;
    assert.equal((r!.draft as RedditDraft).subreddit, undefined);
    assert.equal(r!.status, "needs_review");
  });

  it("keeps link posts as link posts", async () => {
    const plan = transformBundle(await load("reddit"), "reddit");
    const d = plan.results[2]!.draft as RedditDraft;
    assert.equal(d.kind, "link");
    assert.equal(d.url, "https://lighterpack.com/r/xyz");
    assert.equal(d.subreddit, "Ultralight");
  });
});

describe("→ instagram", () => {
  it("skips text-only posts", async () => {
    const plan = transformBundle(await load("reddit"), "instagram");
    assert.equal(plan.results[0]!.status, "skipped");
    assert.match(plan.results[0]!.reason!, /photo or video/);
  });

  it("builds a caption from a Reddit title, dropping the resolution tag", async () => {
    const plan = transformBundle(await load("reddit"), "instagram");
    const d = plan.results[1]!.draft as InstagramDraft;
    assert.equal(d.kind, "single");
    assert.equal(d.caption, "Sunrise over the ridge, Colorado");
  });

  it("caps carousels at 20 and hashtags at 5", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `#tag${i}`).join(" ");
    const [r] = transformBundle(
      single({ text: `Big trip.\n\n${tags}` }, img(25), "twitter"),
      "instagram",
    ).results;
    const d = r!.draft as InstagramDraft;
    assert.equal(d.kind, "carousel");
    assert.equal(d.mediaIds.length, 20);
    assert.equal((d.caption.match(/#tag/g) ?? []).length, 5);
  });

  it("makes a single video a reel and carries alt text", () => {
    const media: MediaAsset[] = [{ id: "sha256:v", kind: "video", path: "v.mp4", altText: "running" }];
    const [r] = transformBundle(single({ text: "POV" }, media, "twitter"), "instagram").results;
    const d = r!.draft as InstagramDraft;
    assert.equal(d.kind, "reel");
    assert.deepEqual(d.altText, { "sha256:v": "running" });
  });

  it("spells out links since captions can't link", () => {
    const [r] = transformBundle(
      single({ text: "New post", linkUrl: "https://blog.example/x" }, img(1), "twitter"),
      "instagram",
    ).results;
    assert.match((r!.draft as InstagramDraft).caption, /🔗 https:\/\/blog\.example\/x/);
  });

  it("enforces the 2200 character caption limit", () => {
    const [r] = transformBundle(
      single({ text: "word ".repeat(1000) }, img(1), "twitter"),
      "instagram",
    ).results;
    assert.ok([...(r!.draft as InstagramDraft).caption].length <= 2200);
  });
});

describe("plan summary", () => {
  it("counts statuses", async () => {
    const plan = transformBundle(await load("twitter"), "instagram");
    assert.deepEqual(plan.summary, { ready: 1, needs_review: 0, skipped: 2 });
  });
});
