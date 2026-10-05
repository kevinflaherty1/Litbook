/** Calendar invites (RFC 5545 .ics) and "add to Google Calendar" links. */

export type CalendarEvent = {
  /** Stable id, so re-downloading updates the same event instead of duplicating it. */
  uid: string;
  start: Date;
  durationMinutes: number;
  title: string;
  description?: string;
  /** Meeting link or place. */
  location?: string | null;
  url?: string | null;
};

/** 20261005T143000Z */
export function icsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds content lines at 75 octets, as RFC 5545 requires. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    if (size + charSize > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(events: CalendarEvent[], options: { name?: string; now?: Date } = {}) {
  const stamp = icsDate(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Litbook//Recording schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.name ? [`X-WR-CALNAME:${escapeText(options.name)}`] : []),
  ];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@litbook`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e: CalendarEvent) {
  const end = new Date(e.start.getTime() + e.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(end)}`,
  });
  if (e.description) params.set("details", e.description);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** The recording, as the guest sees it. */
export function recordingEvent(input: {
  bookingId: string;
  start: string;
  durationMinutes: number;
  organizationName: string;
  episodeTitle: string;
  meetingUrl: string | null;
}): CalendarEvent {
  return {
    uid: `recording-${input.bookingId}`,
    start: new Date(input.start),
    durationMinutes: input.durationMinutes,
    title: `${input.organizationName}: recording "${input.episodeTitle}"`,
    description: input.meetingUrl
      ? `Join the recording: ${input.meetingUrl}`
      : `Your host will send the link to join.`,
    location: input.meetingUrl,
    url: input.meetingUrl,
  };
}

/** "Tuesday, October 20, 2026 at 3:00 PM UTC". Emails can't know the reader's time zone; the invite can. */
export function formatUtc(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}
