import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Bundle } from "../src/model/types.ts";
import { importExport, scanAndSave } from "../src/pipeline.ts";
import { findMatches, ibanValid, luhn } from "../src/risk/detectors.ts";
import { inventorySensitiveFiles } from "../src/risk/export-files.ts";
import { jpegHasGps } from "../src/risk/media.ts";
import { renderReport, safeTerminal } from "../src/risk/render.ts";
import { buildExcerpt, scanBundle } from "../src/risk/scan.ts";
import { Vault } from "../src/store/vault.ts";
import { transformBundle } from "../src/transformers/index.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

// Assembled at runtime so no secret-shaped literal sits in the repo.
const SECRETS = {
  card: ["4111", "1111", "1111", "1111"].join(" "),
  cardDashed: ["4111", "1111", "1111", "1111"].join("-"),
  aws: "AKIA" + "IOSFODNN7" + "EXAMPLE",
  ghp: "ghp_" + "a1B2c3D4e5".repeat(4).slice(0, 36),
  ssn: ["078", "05", "1120"].join("-"),
  phone: "(555) 867-5309",
  email: "sam.rivera" + "@" + "example.com",
  password: "hunter2hunter2",
} as const;
const RAW_VALUES = [
  SECRETS.card,
  SECRETS.cardDashed,
  "4111111111111111",
  SECRETS.aws,
  SECRETS.ghp,
  SECRETS.ssn,
  "867-5309",
  SECRETS.email,
  SECRETS.password,
];

const detectorIds = (text: string) => findMatches(text).map((m) => m.detector.id);

/** Minimal JPEG whose EXIF has a GPS IFD with a GPSLatitude entry. */
function jpegWithGps(): Buffer {
  const tiff = Buffer.alloc(44);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 offset
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(0x8825, 10); // GPSInfo
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18); // -> GPS IFD
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x0002, 28); // GPSLatitude
  tiff.writeUInt16LE(5, 30);
  tiff.writeUInt32LE(3, 32);
  const app1Body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(app1Body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1Body, Buffer.from([0xff, 0xd9])]);
}

/** A copy of the twitter fixture with risky tweets, a geotagged photo and DMs. */
async function riskyTwitterExport(dir: string): Promise<void> {
  await cp(fixture("twitter"), dir, { recursive: true });
  const tweet = (id: string, text: string, extra: object = {}) => ({
    tweet: {
      id_str: id,
      created_at: "Fri Mar 08 10:00:00 +0000 2024",
      full_text: text,
      favorite_count: "0",
      retweet_count: "0",
      entities: {},
      ...extra,
    },
  });
  const existing = (await readFile(path.join(dir, "data/tweets.js"), "utf8")).replace(/^[^=]*=/, "");
  const tweets = [
    ...JSON.parse(existing),
    tweet("2001", `lol my new card came ${SECRETS.card} don't steal it`),
    tweet("2002", `deploy key ${SECRETS.aws} and token ${SECRETS.ghp} oops`),
    tweet("2003", `call me ${SECRETS.phone} or mail ${SECRETS.email}`),
    tweet("2004", `wifi password is ${SECRETS.password} for the party`),
    tweet("2005", `same card again ${SECRETS.cardDashed}`),
    tweet("2006", "Photo from the porch https://t.co/geo1", {
      extended_entities: {
        media: [
          {
            url: "https://t.co/geo1",
            media_url_https: "https://pbs.twimg.com/media/PORCH.jpg",
            type: "photo",
          },
        ],
      },
    }),
  ];
  await writeFile(path.join(dir, "data/tweets.js"), `window.YTD.tweets.part0 = ${JSON.stringify(tweets)}`);
  await writeFile(path.join(dir, "data/tweets_media/2006-PORCH.jpg"), jpegWithGps());
  await writeFile(path.join(dir, "data/direct-messages.js"), "window.YTD.direct_messages.part0 = []");
  await writeFile(path.join(dir, "data/ip-audit.js"), "window.YTD.ip_audit.part0 = []");
}

describe("detectors", () => {
  it("validates card numbers with Luhn and IBANs with mod-97", () => {
    assert.ok(luhn(SECRETS.card));
    assert.ok(!luhn("4111 1111 1111 1112"));
    assert.ok(ibanValid("GB82 WEST 1234 5698 7654 32"));
    assert.ok(!ibanValid("GB82 WEST 1234 5698 7654 33"));
  });

  it("flags each kind of sensitive value", () => {
    assert.deepEqual(detectorIds(`pay ${SECRETS.card}`), ["credit_card"]);
    assert.deepEqual(detectorIds(`ssn ${SECRETS.ssn}`), ["us_ssn"]);
    assert.deepEqual(detectorIds(`k=${SECRETS.aws}`), ["aws_access_key"]);
    assert.deepEqual(detectorIds(SECRETS.ghp), ["github_token"]);
    assert.deepEqual(detectorIds(`ring ${SECRETS.phone}`), ["phone"]);
    assert.deepEqual(detectorIds(`+44 20 7946 0958`), ["phone"]);
    assert.deepEqual(detectorIds(`mail ${SECRETS.email}`), ["email"]);
    assert.deepEqual(detectorIds(`Password: ${SECRETS.password}`), ["password_disclosure"]);
    assert.deepEqual(detectorIds("we're at 39.739236, -104.990251 now"), ["coordinates"]);
    assert.deepEqual(detectorIds("come to 1600 Pennsylvania Avenue tonight"), ["street_address"]);
    assert.deepEqual(detectorIds("DOB: 04/12/1990"), ["date_of_birth"]);
    assert.deepEqual(detectorIds("https://x.io/a?access_token=abcdEFGH1234zz"), ["url_credential"]);
    assert.deepEqual(detectorIds("IBAN GB82 WEST 1234 5698 7654 32"), ["iban"]);
  });

  it("ignores look-alikes", () => {
    assert.deepEqual(detectorIds("4111 1111 1111 1112"), []); // fails Luhn
    assert.deepEqual(detectorIds("tweet 1767123456789012345 at 2024-03-04 15:00:00"), []);
    assert.deepEqual(detectorIds("score 1.5, 2.25 and version 10.2.3"), []);
    assert.deepEqual(detectorIds("I ran 26.2 miles in 3:45:10"), []);
    assert.deepEqual(detectorIds("my password manager is great"), []);
    assert.deepEqual(detectorIds("000-12-3456 is not a valid SSN"), []);
  });

  it("is linear on hostile input", () => {
    const start = performance.now();
    findMatches("1 ".repeat(20_000) + "a@".repeat(20_000) + "-".repeat(20_000));
    assert.ok(performance.now() - start < 2000);
  });
});

describe("excerpts", () => {
  it("masks the target and every neighbouring secret, even one cut by the window edge", () => {
    const text = `${"x".repeat(30)} ${SECRETS.email} then card ${SECRETS.card} then ssn ${SECRETS.ssn} end`;
    const matches = findMatches(text);
    const card = matches.find((m) => m.detector.id === "credit_card")!;
    const ex = buildExcerpt(text, matches, card);
    const joined = ex.before + ex.match + ex.after;
    assert.equal(ex.match, "card ending 1111");
    for (const raw of RAW_VALUES) assert.ok(!joined.includes(raw), `excerpt leaked ${raw}`);
    assert.match(joined, /⟦s•••@e•••\.com⟧/);
    assert.match(joined, /⟦•••-••-1120⟧/);
  });
});

describe("media metadata", () => {
  it("finds GPS in EXIF", () => assert.ok(jpegHasGps(jpegWithGps())));

  it("returns false (never throws) on truncated or random data", () => {
    const good = jpegWithGps();
    for (let cut = 0; cut < good.length; cut++) assert.doesNotThrow(() => jpegHasGps(good.subarray(0, cut)));
    for (let i = 0; i < 500; i++) {
      const junk = Buffer.from(Array.from({ length: 64 }, () => Math.floor(Math.random() * 256)));
      junk[0] = 0xff;
      junk[1] = 0xd8;
      assert.doesNotThrow(() => jpegHasGps(junk));
    }
  });
});

describe("export file inventory", () => {
  it("flags DMs and collapses many files into one entry", () => {
    const files = [
      "your_instagram_activity/messages/inbox/alice_1/message_1.json",
      "your_instagram_activity/messages/inbox/bob_2/message_1.json",
      "your_instagram_activity/content/posts_1.json",
      "personal_information/contacts/synced_contacts.json",
    ];
    const inv = inventorySensitiveFiles("instagram", files);
    assert.deepEqual(
      inv.map((f) => [f.kind, f.severity, f.fileCount]),
      [
        ["direct messages", "high", 2],
        ["phone contacts you uploaded", "high", 1],
      ],
    );
  });
});

describe("scanning a risky export end to end", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "pdm-risk-"));
  after(() => rm(work, { recursive: true, force: true }));
  const exportDir = path.join(work, "export");
  await riskyTwitterExport(exportDir);
  const vault = new Vault(path.join(work, "vault"));
  const { bundle, report } = await importExport(vault, "twitter", exportDir);
  const byDetector = (id: string) => report.findings.filter((f) => f.detector === id);

  it("finds text, media and export-file risks", () => {
    for (const id of [
      "credit_card",
      "aws_access_key",
      "github_token",
      "phone",
      "email",
      "password_disclosure",
      "media_gps",
    ]) {
      assert.ok(byDetector(id).length > 0, `expected a ${id} finding`);
    }
    assert.deepEqual(
      byDetector("sensitive_export_file")
        .map((f) => f.label)
        .sort(),
      ["direct messages", "login IP addresses"],
    );
    assert.ok(report.summary.high >= 6);
  });

  it("never stores or prints a raw sensitive value", async () => {
    const onDisk = await readFile(path.join(vault.root, "risk", `${bundle.id}.json`), "utf8");
    const printed = renderReport(report, { color: true }) + renderReport(report, { color: false });
    for (const raw of RAW_VALUES) {
      assert.ok(!onDisk.includes(raw), `report file leaked ${raw}`);
      assert.ok(!printed.includes(raw), `rendered output leaked ${raw}`);
    }
  });

  it("highlights the masked value in context", () => {
    const out = renderReport(report, { color: false });
    assert.match(out, /my new card came »card ending 1111« don't steal it/);
  });

  it("groups the same value across posts via keyed fingerprints", async () => {
    const cards = byDetector("credit_card");
    assert.equal(cards.length, 2);
    assert.equal(cards[0]!.fingerprint, cards[1]!.fingerprint); // spaced vs dashed: same card
    assert.match(renderReport(report, { color: false }), /same value appears 2×/);

    // A different vault key yields unrelated fingerprints: they can't be
    // precomputed or matched across vaults.
    const other = await scanBundle(bundle, { key: Buffer.alloc(32, 7), mediaFile: () => undefined });
    assert.notEqual(
      other.findings.find((f) => f.detector === "credit_card")!.fingerprint,
      cards[0]!.fingerprint,
    );
  });

  it("keeps the vault key private and stable", async () => {
    const keyFile = path.join(vault.root, ".secret-key");
    const { mode } = await import("node:fs/promises").then((fs) => fs.stat(keyFile));
    if (process.platform !== "win32") assert.equal(mode & 0o777, 0o600);
    assert.deepEqual(await vault.secretKey(), await vault.secretKey());
    const onDisk = await readFile(path.join(vault.root, "risk", `${bundle.id}.json`), "utf8");
    assert.ok(!onDisk.includes((await readFile(keyFile, "utf8")).trim()));
  });

  it("blocks risky posts from transforms and withholds their text", () => {
    const plan = transformBundle(bundle, "reddit", { subreddit: "x" }, new Date(), report);
    const blocked = plan.results.filter((r) => r.status === "blocked");
    assert.ok(blocked.length >= 4);
    for (const r of blocked) {
      assert.equal(r.draft, undefined);
      assert.match(r.reason!, /high-risk/);
    }
    const geo = plan.results.find((r) => r.postIds.includes("twitter:post:2006"))!;
    assert.equal(geo.status, "blocked");
    assert.match(geo.reason!, /GPS location/);
    // High-risk values never reach the plan. (Medium-risk posts keep their
    // draft — it's the user's own content — but are forced into review.)
    const serialized = JSON.stringify(plan);
    const highRisk = RAW_VALUES.filter((v) => v !== SECRETS.email && v !== "867-5309");
    for (const raw of highRisk) assert.ok(!serialized.includes(raw), `plan leaked ${raw}`);
    // Medium-only post (phone/email) is not blocked, but must be reviewed.
    const contact = plan.results.find((r) => r.postIds.includes("twitter:post:2003"))!;
    assert.equal(contact.status, "needs_review");
    assert.ok(contact.warnings.some((w) => w.includes("phone ending 09")));
  });

  it("lets the user override, or acknowledge a single finding", async () => {
    const forced = transformBundle(
      bundle,
      "reddit",
      { subreddit: "x", allowRisky: true },
      new Date(),
      report,
    );
    assert.equal(forced.summary.blocked, 0);

    const geo = byDetector("media_gps")[0]!;
    await vault.acknowledge([geo.id]);
    const rescanned = await scanAndSave(vault, bundle);
    assert.ok(rescanned.findings.find((f) => f.id === geo.id)!.acknowledged);
    const plan = transformBundle(bundle, "reddit", { subreddit: "x" }, new Date(), rescanned);
    assert.notEqual(plan.results.find((r) => r.postIds.includes("twitter:post:2006"))!.status, "blocked");
    await assert.rejects(vault.acknowledge(["../../etc"]), /Not a finding id/);
  });
});

describe("privacy downgrade", () => {
  it("flags followers-only posts as high risk", async () => {
    const bundle: Bundle = {
      schemaVersion: 1,
      id: "t",
      source: "instagram",
      importedAt: "2026-01-01T00:00:00.000Z",
      profile: { platform: "instagram", handle: "me" },
      posts: [
        {
          id: "p1",
          source: { platform: "instagram" },
          createdAt: "2024-01-01T00:00:00.000Z",
          text: "close friends only",
          entities: { hashtags: [], mentions: [], urls: [] },
          mediaIds: [],
          visibility: "followers",
          engagement: {},
        },
      ],
      comments: [],
      connections: [],
      media: {},
      importWarnings: [],
    };
    const report = await scanBundle(bundle, { key: Buffer.alloc(32), mediaFile: () => undefined });
    assert.equal(report.findings[0]!.detector, "non_public_post");
    assert.equal(report.findings[0]!.severity, "high");
  });
});

describe("terminal safety", () => {
  it("strips escape sequences and bidi overrides from untrusted text", () => {
    assert.equal(safeTerminal("ok\u001b[2J\u001b]0;pwned\u0007‮done\u0000"), "okdone");
    assert.equal(safeTerminal("line1\nline2\ttab"), "line1\nline2\ttab");
  });
});
