import { describe, expect, it } from "vitest";

import { buildIcs, formatUtc, googleCalendarUrl, icsDate, recordingEvent } from "@/lib/calendar";

const event = recordingEvent({
  bookingId: "b1",
  start: "2026-10-20T15:00:00.000Z",
  durationMinutes: 45,
  organizationName: "Deep Dive, Radio",
  episodeTitle: "Poetical Science",
  meetingUrl: "https://riverside.fm/studio/deep-dive",
});

describe("calendar", () => {
  it("formats UTC dates", () => {
    expect(icsDate(new Date("2026-10-20T15:00:00.000Z"))).toBe("20261020T150000Z");
  });

  it("builds a valid invite", () => {
    const ics = buildIcs([event], { now: new Date("2026-10-05T00:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261020T150000Z\r\nDTEND:20261020T154500Z");
    expect(ics).toContain("UID:recording-b1@litbook");
    // Commas are escaped in text values.
    expect(ics).toContain('SUMMARY:Deep Dive\\, Radio: recording "Poetical Science"');
    expect(ics).toContain("LOCATION:https://riverside.fm/studio/deep-dive");
  });

  it("folds long lines at 75 octets", () => {
    const ics = buildIcs([{ ...event, description: "é".repeat(100) }]);
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${"é".repeat(100)}`);
  });

  it("formats times for emails in UTC", () => {
    expect(formatUtc("2026-10-20T15:00:00.000Z")).toBe("Tuesday, October 20, 2026 at 3:00 PM UTC");
  });

  it("links to Google Calendar", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get("dates")).toBe("20261020T150000Z/20261020T154500Z");
    expect(url.searchParams.get("location")).toBe("https://riverside.fm/studio/deep-dive");
  });
});
