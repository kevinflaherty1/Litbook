import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/redirect";

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/acme/settings")).toBe("/acme/settings");
    expect(safeNextPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it("falls back for missing values", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)"])(
    "rejects open redirect %s",
    (next) => {
      expect(safeNextPath(next)).toBe("/dashboard");
    },
  );

  it("accepts absolute URLs only from the given origin", () => {
    const origin = "http://localhost:3000";
    expect(safeNextPath("http://localhost:3000/invite/abc", origin)).toBe("/invite/abc");
    expect(safeNextPath("https://evil.com/invite/abc", origin)).toBe("/dashboard");
    expect(safeNextPath("http://localhost:3000//evil.com", origin)).toBe("/dashboard");
  });
});
