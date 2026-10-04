import { describe, expect, it } from "vitest";

import { bookNewGuestSchema } from "@/schemas/booking";
import { createEpisodeSchema, episodeListFilterSchema } from "@/schemas/episode";
import { createGuestSchema, guestListFilterSchema } from "@/schemas/guest";

const orgId = "0a000000-0000-4000-8000-000000000000";
const episode = {
  orgId,
  title: "  Building in public  ",
  description: "",
  episodeNumber: "",
  status: "draft",
  recordingAt: "",
  publishAt: "",
} as const;

describe("createEpisodeSchema", () => {
  it("trims and turns empty optional fields into null", () => {
    expect(createEpisodeSchema.parse(episode)).toMatchObject({
      title: "Building in public",
      description: null,
      episodeNumber: null,
      recordingAt: null,
      publishAt: null,
    });
  });

  it("parses episode numbers and timestamps", () => {
    const parsed = createEpisodeSchema.parse({
      ...episode,
      episodeNumber: "42",
      recordingAt: "2026-10-05T14:30:00.000Z",
      publishAt: "2026-10-12T09:00:00+00:00",
    });
    expect(parsed.episodeNumber).toBe(42);
    expect(parsed.recordingAt).toBe("2026-10-05T14:30:00.000Z");
    expect(parsed.publishAt).toBe("2026-10-12T09:00:00+00:00");
  });

  it.each(["0", "-1", "1.5", "abc", "1234567"])("rejects episode number %j", (episodeNumber) => {
    expect(createEpisodeSchema.safeParse({ ...episode, episodeNumber }).success).toBe(false);
  });

  it("rejects an empty title, unknown status, or a bad timestamp", () => {
    expect(createEpisodeSchema.safeParse({ ...episode, title: "   " }).success).toBe(false);
    expect(createEpisodeSchema.safeParse({ ...episode, status: "live" }).success).toBe(false);
    expect(createEpisodeSchema.safeParse({ ...episode, recordingAt: "2026-10-05 14:30" }).success).toBe(
      false,
    );
  });
});

describe("list filters", () => {
  it("falls back to defaults for junk search params", () => {
    expect(episodeListFilterSchema.parse({ status: "bogus", page: "-3" })).toEqual({
      status: undefined,
      page: 1,
    });
    expect(episodeListFilterSchema.parse({ status: "scheduled", page: "2" })).toEqual({
      status: "scheduled",
      page: 2,
    });
    expect(guestListFilterSchema.parse({})).toEqual({ q: "", page: 1 });
    expect(guestListFilterSchema.parse({ q: "  ada ", page: "x" })).toEqual({ q: "ada", page: 1 });
  });
});

describe("guest schemas", () => {
  it("lowercases email and nulls empty optional fields", () => {
    expect(
      createGuestSchema.parse({ orgId, fullName: " Ada ", email: " Ada@Example.COM ", internalNotes: "" }),
    ).toEqual({ orgId, fullName: "Ada", email: "ada@example.com", internalNotes: null });
    expect(
      createGuestSchema.parse({ orgId, fullName: "Ada", email: "", internalNotes: " met at conf " }),
    ).toMatchObject({ email: null, internalNotes: "met at conf" });
  });

  it("rejects a bad email or a missing name", () => {
    expect(
      createGuestSchema.safeParse({ orgId, fullName: "Ada", email: "nope", internalNotes: "" }).success,
    ).toBe(false);
    expect(bookNewGuestSchema.safeParse({ orgId, episodeId: orgId, fullName: "", email: "" }).success).toBe(
      false,
    );
  });
});
