import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { importers } from "../src/importers/index.ts";
import { Vault } from "../src/store/vault.ts";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("vault", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pdm-vault-"));
  after(() => rm(root, { recursive: true, force: true }));
  const vault = new Vault(root);
  const imported = await importers.instagram.import(fixture("instagram"));
  const bundle = await vault.save(imported, fixture("instagram"), new Date("2026-01-02T03:04:05Z"));

  it("names bundles by platform, handle and time", () => {
    assert.equal(bundle.id, "instagram-sam.outdoors-20260102T030405Z");
  });

  it("stores media content-addressed and rewrites post references", async () => {
    for (const post of bundle.posts) {
      for (const id of post.mediaIds) {
        assert.match(id, /^sha256:[0-9a-f]{64}$/);
        const asset = bundle.media[id]!;
        const bytes = await readFile(vault.mediaPath(asset)!);
        assert.ok(bytes.length > 0);
      }
    }
  });

  it("writes files readable only by the owner", { skip: process.platform === "win32" }, async () => {
    const mode = (await stat(path.join(root, "bundles", `${bundle.id}.json`))).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("round-trips through disk and the index", async () => {
    assert.deepEqual(await vault.load(bundle.id), bundle);
    const [summary] = await vault.list();
    assert.deepEqual(summary!.counts, { posts: 3, comments: 1, connections: 2, media: 5 });
    assert.equal((await vault.latest("instagram"))!.id, bundle.id);
  });

  it("dedupes media across imports", async () => {
    const second = await vault.save(imported, fixture("instagram"), new Date("2026-01-03T00:00:00Z"));
    assert.deepEqual(Object.keys(second.media).sort(), Object.keys(bundle.media).sort());
    assert.equal((await vault.list()).length, 2);
  });

  it("refuses media paths that escape the export folder", async () => {
    const evil = structuredClone(imported);
    evil.media = { "tmp:0": { id: "tmp:0", kind: "image", path: "../../etc/passwd" } };
    evil.posts = [{ ...evil.posts[0]!, mediaIds: ["tmp:0"] }];
    const saved = await vault.save(evil, fixture("instagram"), new Date("2026-01-04T00:00:00Z"));
    assert.deepEqual(saved.media, {});
    assert.deepEqual(saved.posts[0]!.mediaIds, []);
    assert.ok(saved.importWarnings.some((w) => w.includes("escapes")));
  });

  it("rejects bundle ids that look like paths", async () => {
    await assert.rejects(vault.load("../index"), /Invalid bundle id/);
  });
});
