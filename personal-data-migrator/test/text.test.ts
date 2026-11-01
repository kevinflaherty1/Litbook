import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractEntities, fixMetaMojibake } from "../src/model/text.ts";
import {
  markdownToPlain,
  plainToMarkdown,
  splitTrailingHashtags,
  truncate,
} from "../src/transformers/text.ts";
import { parseCsv } from "../src/util/csv.ts";

describe("extractEntities", () => {
  it("finds tags, mentions and urls without false positives in urls/emails", () => {
    const e = extractEntities(
      "Hi @Alice and u/bob_99! #Trail #trail see https://x.com/a#frag mail me@example.com #123",
    );
    assert.deepEqual(e.hashtags, ["Trail"]);
    assert.deepEqual(e.mentions, ["Alice", "bob_99"]);
    assert.deepEqual(e.urls, ["https://x.com/a#frag"]);
  });

  it("handles non-Latin hashtags", () => {
    assert.deepEqual(extractEntities("登山 #山 #café").hashtags, ["山", "café"]);
  });
});

describe("fixMetaMojibake", () => {
  it("re-decodes double-encoded UTF-8 and leaves real text alone", () => {
    const broken = Buffer.from("Café ☀️", "utf8").toString("latin1");
    assert.equal(fixMetaMojibake(broken), "Café ☀️");
    assert.equal(fixMetaMojibake("Café"), "Café");
    assert.equal(fixMetaMojibake("plain"), "plain");
  });
});

describe("splitTrailingHashtags", () => {
  it("separates a hashtag wall from inline tags", () => {
    assert.deepEqual(splitTrailingHashtags("Loved #Denver today.\n.\n.\n#a #b\n#c"), {
      body: "Loved #Denver today.",
      tags: ["a", "b", "c"],
    });
  });
  it("takes tags trailing the last sentence", () => {
    assert.deepEqual(splitTrailingHashtags("Sunset! #beach #sky"), {
      body: "Sunset!",
      tags: ["beach", "sky"],
    });
  });
  it("leaves text without tags alone", () => {
    assert.deepEqual(splitTrailingHashtags("Just words."), { body: "Just words.", tags: [] });
  });
});

describe("markdown", () => {
  it("flattens Reddit markdown", () => {
    assert.equal(
      markdownToPlain("# Head\n\n**bold** and *it* and [site](https://s.io)\n\n- one\n- two"),
      "Head\n\nbold and it and site (https://s.io)\n\n• one\n• two",
    );
  });
  it("escapes plain text for Reddit", () => {
    assert.equal(plainToMarkdown("#tag *not bold*\nline2\n\npara"), "\\#tag \\*not bold\\*  \nline2\n\npara");
  });
});

describe("truncate", () => {
  it("cuts on a word boundary with an ellipsis", () => {
    assert.equal(truncate("the quick brown fox", 12), "the quick…");
    assert.equal(truncate("short", 12), "short");
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded newlines and CRLF", () => {
    const rows = parseCsv('﻿id,body\r\n1,"a, ""quoted""\nmultiline"\r\n2,plain\r\n');
    assert.deepEqual(rows, [
      { id: "1", body: 'a, "quoted"\nmultiline' },
      { id: "2", body: "plain" },
    ]);
  });
});
