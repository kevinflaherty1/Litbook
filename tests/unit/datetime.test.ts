import { describe, expect, it } from "vitest";

import { isoToLocalInput, localInputToIso } from "@/lib/datetime";

describe("datetime-local conversion", () => {
  it("round-trips through the local time zone", () => {
    const iso = "2026-10-05T14:30:00.000Z";
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });

  it("formats as YYYY-MM-DDTHH:mm", () => {
    expect(isoToLocalInput("2026-10-05T14:30:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("returns empty strings for empty or invalid input", () => {
    expect(isoToLocalInput("not a date")).toBe("");
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("garbage")).toBe("");
  });
});
