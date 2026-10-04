import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createOrganizationSchema, orgSlugSchema, RESERVED_SLUGS, slugify } from "@/schemas/organization";

describe("slugify", () => {
  it("builds URL-safe slugs", () => {
    expect(slugify("The Daily Grind Podcast!")).toBe("the-daily-grind-podcast");
    expect(slugify("  Café Société  ")).toBe("cafe-societe");
    expect(slugify("a".repeat(60))).toHaveLength(48);
  });

  it("never ends with a hyphen after truncation", () => {
    expect(slugify(`${"a".repeat(47)} b`)).not.toMatch(/-$/);
  });
});

describe("orgSlugSchema", () => {
  it.each(["acme", "the-daily-grind", "pod42"])("accepts %s", (slug) => {
    expect(orgSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(["ab", "-acme", "acme-", "Acme Pod", "a_b", "a".repeat(49)])("rejects %s", (slug) => {
    expect(orgSlugSchema.safeParse(slug).success).toBe(false);
  });

  it("lowercases input", () => {
    expect(orgSlugSchema.parse("ACME")).toBe("acme");
  });

  it("rejects reserved slugs", () => {
    for (const slug of ["login", "dashboard", "settings", "submit"]) {
      expect(orgSlugSchema.safeParse(slug).success).toBe(false);
    }
  });

  it("keeps the reserved list in sync with the database constraint", () => {
    const sql = readFileSync(
      join(__dirname, "../../supabase/migrations/20261004010000_reserved_slugs_and_invitation_preview.sql"),
      "utf8",
    );
    const list = sql.match(/slug not in \(([\s\S]*?)\)/)?.[1] ?? "";
    const dbSlugs = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(dbSlugs).toEqual([...RESERVED_SLUGS].sort());
  });
});

describe("createOrganizationSchema", () => {
  it("trims the name", () => {
    expect(createOrganizationSchema.parse({ name: "  Acme  ", slug: "acme" }).name).toBe("Acme");
  });

  it("requires a name", () => {
    expect(createOrganizationSchema.safeParse({ name: " ", slug: "acme" }).success).toBe(false);
  });
});
