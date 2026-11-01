import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { csvCell, exportBookmarks, safeHttpUrl } from "../src/exporters/bookmarks.ts";
import { importers } from "../src/importers/index.ts";
import type { Bundle, Platform, SavedItem } from "../src/model/types.ts";
import { validateBundle } from "../src/model/validate.ts";
import { scanBundle } from "../src/risk/scan.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function load(p: Platform): Promise<Bundle> {
  const imported = await importers[p].import(fixture(p));
  return { ...imported, id: `test-${p}`, importedAt: "2026-01-01T00:00:00.000Z" };
}

function withSaved(saved: SavedItem[]): Bundle {
  return {
    schemaVersion: 1,
    id: "t",
    source: "twitter",
    importedAt: "2026-01-01T00:00:00.000Z",
    profile: { platform: "twitter", handle: "me" },
    posts: [],
    comments: [],
    connections: [],
    media: {},
    saved,
    collections: [],
    importWarnings: [],
  };
}

const item = (over: Partial<SavedItem>): SavedItem => ({
  id: "s1",
  kind: "like",
  source: { platform: "twitter", url: "https://x.com/a/status/1" },
  targetType: "post",
  collections: [],
  ...over,
});

describe("importing likes, saves and collections", () => {
  it("instagram: likes, saves, and collections merged with saves", async () => {
    const b = await load("instagram");
    const likes = b.saved!.filter((s) => s.kind === "like");
    const saves = b.saved!.filter((s) => s.kind === "save");
    assert.equal(likes.length, 3);
    assert.deepEqual(
      likes.map((l) => l.targetType),
      ["post", "post", "comment"],
    );
    assert.equal(saves.length, 3); // collection items are the same saves, not duplicates
    assert.deepEqual(
      b.collections!.map((c) => [c.name, c.itemIds.length]),
      [
        ["Hikes to do", 2],
        ["Gear ⛺", 1],
      ],
    );
    const rei = saves.find((s) => s.author === "rei")!;
    assert.deepEqual(rei.collections, ["Hikes to do", "Gear ⛺"]);
    assert.equal(rei.source.id, "CxSAVE1");
    assert.equal(rei.savedAt, "2024-04-13T09:20:00.000Z"); // from saved_posts.json, not "Added Time"
    assert.ok(saves.some((s) => s.author === "café_rando"));
  });

  it("twitter: likes keep the tweet text", async () => {
    const b = await load("twitter");
    assert.equal(b.saved!.length, 2);
    assert.equal(b.saved![1]!.textPreview, "Leave no trace: pack it in, pack it out.");
    assert.equal(b.saved![1]!.source.id, "5002");
  });

  it("reddit: saves and votes, skipping removed votes", async () => {
    const b = await load("reddit");
    assert.deepEqual(
      b.saved!.map((s) => [s.kind, s.targetType, s.direction ?? "", s.community]),
      [
        ["save", "post", "", "Ultralight"],
        ["save", "comment", "", "CampingandHiking"],
        ["vote", "post", "up", "EarthPorn"],
        ["vote", "post", "down", "hiking"],
        ["vote", "comment", "up", "Ultralight"],
      ],
    );
  });

  it("validates collection references", () => {
    const b = withSaved([item({})]);
    b.collections = [{ id: "c", name: "X", itemIds: ["missing"] }];
    assert.deepEqual(validateBundle(b), ['collection "X" references unknown saved item missing']);
  });

  it("still loads bundles stored before saved items existed", () => {
    const old = withSaved([]);
    delete old.saved;
    delete old.collections;
    assert.deepEqual(validateBundle(old), []);
    assert.equal(exportBookmarks(old, "html").exported, 0);
  });
});

describe("bookmark export", () => {
  it("writes collections as folders in a Netscape bookmark file", async () => {
    const html = exportBookmarks(await load("instagram"), "html").content;
    assert.match(html, /^<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
    assert.match(html, /<H3>Hikes to do<\/H3>[\s\S]*CxSAVE2[\s\S]*<H3>Gear ⛺<\/H3>/);
    assert.match(html, /HREF="https:\/\/www\.instagram\.com\/p\/CxSAVE1\/" ADD_DATE="1713000000"/);
  });

  it("leaves out downvotes unless asked", async () => {
    const b = await load("reddit");
    assert.equal(exportBookmarks(b, "csv").exported, 4);
    assert.equal(exportBookmarks(b, "csv", { includeDownvotes: true }).exported, 5);
  });

  it("escapes hostile text and refuses non-http links", () => {
    const b = withSaved([
      item({ id: "a", textPreview: '<script>alert(1)</script> "quoted" & more' }),
      item({ id: "b", source: { platform: "twitter", url: "javascript:alert(1)" } }),
      item({ id: "c", source: { platform: "twitter", url: "data:text/html,<b>x</b>" } }),
      item({ id: "d", source: { platform: "twitter" } }),
      item({ id: "e", source: { platform: "twitter", url: 'https://x.com/"><img src=x onerror=alert(1)>' } }),
    ]);
    const result = exportBookmarks(b, "html");
    assert.equal(result.exported, 2);
    assert.equal(result.droppedUnsafe, 3);
    assert.doesNotMatch(result.content, /<script|javascript:|data:text|<img/);
    assert.match(result.content, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;quoted&quot; &amp; more/);
  });

  it("defuses spreadsheet formulas in CSV", () => {
    assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
    assert.equal(csvCell("+1 555"), `"'+1 555"`);
    assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
    assert.equal(csvCell("line1\nline2"), `"line1 line2"`);
    const csv = exportBookmarks(withSaved([item({ textPreview: "=cmd|' /C calc'!A0" })]), "csv").content;
    assert.match(csv, /"'=cmd\|' \/C calc'!A0"/);
  });

  it("only accepts http(s) URLs", () => {
    assert.equal(safeHttpUrl("https://a.io/x"), "https://a.io/x");
    assert.equal(safeHttpUrl("JaVaScRiPt:alert(1)"), undefined);
    assert.equal(safeHttpUrl("not a url"), undefined);
  });
});

describe("risk scan of saved links", () => {
  it("flags a token in a bookmarked URL, masked", async () => {
    const token = "abcd" + "EFGH" + "1234" + "zzzz";
    const b = withSaved([
      item({ source: { platform: "twitter", url: `https://app.io/reset?token=${token}` } }),
    ]);
    const report = await scanBundle(b, { key: Buffer.alloc(32), mediaFile: () => undefined });
    assert.equal(report.findings[0]!.detector, "url_credential");
    assert.equal(report.findings[0]!.location.record, "saved");
    assert.ok(!JSON.stringify(report).includes(token));
  });
});
