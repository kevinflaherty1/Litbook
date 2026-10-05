import type { NextRequest } from "next/server";

import { listEpisodeSlots } from "@/features/scheduling/queries";
import { buildIcs, recordingEvent, type CalendarEvent } from "@/lib/calendar";
import { attachment, getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { fileSlug } from "@/lib/show-notes";

/** The episode's booked recordings (or its recording date) as a calendar file for the host. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/[orgSlug]/episodes/[episodeId]/calendar.ics">,
) {
  const { orgSlug, episodeId } = await ctx.params;
  const access = await getOrgForRoute(orgSlug, episodeId);
  if (!access) return notFoundResponse();

  const { data: episode, error } = await access.supabase
    .from("episodes")
    .select("id, title, recording_at, meeting_url")
    .eq("organization_id", access.org.id)
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw error;
  if (!episode) return notFoundResponse();

  const slots = (await listEpisodeSlots(access.org.id, episode.id)).filter((s) => s.bookingId);
  const events: CalendarEvent[] = slots.map((s) => ({
    ...recordingEvent({
      bookingId: s.bookingId!,
      start: s.starts_at,
      durationMinutes: s.duration_minutes,
      organizationName: access.org.name,
      episodeTitle: episode.title,
      meetingUrl: episode.meeting_url,
    }),
    title: `Recording "${episode.title}" with ${s.guestName}`,
  }));
  if (!events.length && episode.recording_at) {
    events.push({
      uid: `episode-${episode.id}`,
      start: new Date(episode.recording_at),
      durationMinutes: 60,
      title: `Recording "${episode.title}"`,
      location: episode.meeting_url,
      url: episode.meeting_url,
    });
  }
  if (!events.length) return new Response("Nothing is scheduled for this episode yet.", { status: 404 });

  return new Response(buildIcs(events, { name: episode.title }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": attachment(`${fileSlug(episode.title)}.ics`),
      "Cache-Control": "private, no-store",
    },
  });
}
