import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { detectPlatform, importers } from "../src/importers/index.ts";
import { parseYtd } from "../src/importers/twitter.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("platform detection", () => {
  for (const p of ["instagram", "twitter", "reddit"] as const) {
    it(`detects ${p}`, async () => assert.equal(await detectPlatform(fixture(p)), p));
  }
});

describe("instagram importer", async () => {
  const b = await importers.instagram.import(fixture("instagram"));

  it("reads the profile and repairs Meta's mojibake", () => {
    assert.equal(b.profile.handle, "sam.outdoors");
    assert.equal(b.profile.displayName, "Sam Rivera ⛰️");
    assert.equal(b.profile.bio, "Chasing ridgelines. Café enthusiast.");
  });

  it("maps single posts, carousels and reels", () => {
    assert.equal(b.posts.length, 3);
    const [single, carousel, reel] = b.posts;
    assert.match(single!.text, /^Sunrise on the ridge — worth the 4am alarm ☀️/);
    assert.equal(single!.mediaIds.length, 1);
    assert.deepEqual(single!.entities.mentions, ["trailbuddy"]);
    assert.ok(single!.entities.hashtags.includes("sunrise"));
    assert.equal(carousel!.mediaIds.length, 3);
    assert.equal(carousel!.createdAt, "2024-04-01T19:33:20.000Z");
    assert.deepEqual(reel!.extensions?.instagram, { kind: "reel" });
    assert.equal(b.media[reel!.mediaIds[0]!]!.kind, "video");
  });

  it("reads comments and both connection directions", () => {
    assert.equal(b.comments[0]!.text, "So good 😍");
    assert.deepEqual(
      b.connections.map((c) => [c.direction, c.handle]),
      [
        ["follower", "trailbuddy"],
        ["following", "natgeo"],
      ],
    );
  });

  it("gives the same ids on re-import", async () => {
    const again = await importers.instagram.import(fixture("instagram"));
    assert.deepEqual(
      again.posts.map((p) => p.id),
      b.posts.map((p) => p.id),
    );
  });
});

describe("twitter importer", async () => {
  const b = await importers.twitter.import(fixture("twitter"));
  const byId = (id: string) => b.posts.find((p) => p.source.id === id)!;

  it("parses window.YTD files", () => {
    assert.deepEqual(parseYtd('window.YTD.x.part0 = [{"a":1}]'), [{ a: 1 }]);
  });

  it("reads the profile", () => {
    assert.equal(b.profile.handle, "samrivera");
    assert.equal(b.profile.bio, "Hiker. Coffee. Maps.");
  });

  it("decodes HTML entities and expands t.co links, dropping media links", () => {
    assert.match(byId("1001").text, /this summer & documenting every mile/);
    assert.equal(byId("1002").text, "Gear list is up on the blog https://samrivera.example/pct-gear");
    assert.equal(byId("1002").linkUrl, "https://samrivera.example/pct-gear");
  });

  it("links self-replies into a thread and treats replies to others as comments", () => {
    assert.ok(byId("1001").threadId);
    assert.equal(byId("1001").threadId, byId("1002").threadId);
    assert.equal(byId("1005").threadId, undefined);
    assert.equal(b.comments.length, 1);
    assert.equal(b.comments[0]!.parentSourceId, "900");
  });

  it("marks retweets as reposts", () => assert.equal(byId("1004").relation?.kind, "repost"));

  it("finds media in tweets_media and keeps alt text", () => {
    const media = b.media[byId("1002").mediaIds[0]!]!;
    assert.equal(media.path, "data/tweets_media/1002-GEAR.jpg");
    assert.equal(media.altText, "Backpack contents laid out on the floor");
  });
});

describe("reddit importer", async () => {
  const b = await importers.reddit.import(fixture("reddit"));
  const [self, image, link] = b.posts;

  it("reads the account name from statistics.csv", () => assert.equal(b.profile.handle, "sam_rivera"));

  it("classifies self, image and link posts", () => {
    assert.equal(self!.title, "First solo overnight — lessons learned");
    assert.match(self!.text, /\*\*Bring more water\*\*/); // markdown kept as-is in the model
    assert.equal(self!.mediaIds.length, 0);
    assert.equal(self!.linkUrl, undefined);
    assert.equal(b.media[image!.mediaIds[0]!]!.remoteUrl, "https://i.redd.it/ridge123.jpg");
    assert.equal(link!.linkUrl, "https://lighterpack.com/r/xyz");
    assert.equal(link!.community, "Ultralight");
  });

  it("parses Reddit's date format", () => assert.equal(self!.createdAt, "2024-03-10T14:22:01.000Z"));

  it("does not keep IP addresses anywhere", () => assert.doesNotMatch(JSON.stringify(b), /10\.0\.0\.1/));
});
