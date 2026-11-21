import { describe, expect, it } from "vitest";
import {
  extractShortcode,
  mediaIdToShortcode,
  parseCollectionUrl,
  shortcodeToMediaId,
  uniqueShortcodes,
} from "./shortcode";

describe("extractShortcode", () => {
  it.each([
    ["/p/C9xYzAbCdEf/", "C9xYzAbCdEf"],
    ["/reel/C9xYzAbCdEf/?igsh=abc", "C9xYzAbCdEf"],
    ["https://www.instagram.com/reels/DA_b-c1234x/", "DA_b-c1234x"],
    ["/someuser/p/C9xYzAbCdEf/", "C9xYzAbCdEf"],
    ["/tv/B1234567890/", "B1234567890"],
  ])("%s", (href, code) => expect(extractShortcode(href)).toBe(code));

  it("ignores non-post links", () => {
    expect(extractShortcode("/someuser/saved/recipes/123/")).toBeNull();
    expect(extractShortcode("/explore/")).toBeNull();
  });
});

describe("shortcodeToMediaId", () => {
  it("decodes base64 digits", () => {
    expect(shortcodeToMediaId("A")).toBe("0");
    expect(shortcodeToMediaId("B")).toBe("1");
    expect(shortcodeToMediaId("BA")).toBe("64");
    expect(shortcodeToMediaId("_")).toBe("63");
  });

  it("handles 19-digit ids beyond Number precision", () => {
    const id = "3456789012345678901";
    expect(shortcodeToMediaId(mediaIdToShortcode(id))).toBe(id);
  });

  it("uses only the id part of long private-account shortcodes", () => {
    const code = mediaIdToShortcode("3456789012345678901");
    expect(code).toHaveLength(11);
    expect(shortcodeToMediaId(code + "AbCdEfGhIjKlMnOpQrStUvWxYz12")).toBe("3456789012345678901");
  });

  it("rejects invalid characters", () => {
    expect(() => shortcodeToMediaId("abc$")).toThrow(/Invalid shortcode/);
  });
});

describe("parseCollectionUrl", () => {
  it("parses a named collection", () => {
    expect(parseCollectionUrl("https://www.instagram.com/me/saved/meal-prep/17912345678/")).toEqual({
      slug: "meal-prep",
      id: "17912345678",
      name: "Meal Prep",
      url: "https://www.instagram.com/me/saved/meal-prep/17912345678/",
    });
  });

  it("parses all-posts and drops the query", () => {
    expect(parseCollectionUrl("https://www.instagram.com/me/saved/all-posts/?hl=en")).toMatchObject({
      slug: "all-posts",
      id: null,
      name: "All Posts",
      url: "https://www.instagram.com/me/saved/all-posts/",
    });
  });

  it("rejects other pages and hosts", () => {
    expect(parseCollectionUrl("https://www.instagram.com/me/saved/")).toBeNull();
    expect(parseCollectionUrl("https://www.instagram.com/p/C9xYzAbCdEf/")).toBeNull();
    expect(parseCollectionUrl("https://evil.example/me/saved/x/1/")).toBeNull();
    expect(parseCollectionUrl("not a url")).toBeNull();
  });
});

it("uniqueShortcodes keeps first occurrence order", () => {
  expect(uniqueShortcodes(["/p/AAAAA/", "/reel/BBBBB/", "/explore/", "/p/AAAAA/?x=1", "/p/CCCCC/"])).toEqual([
    "AAAAA",
    "BBBBB",
    "CCCCC",
  ]);
});
