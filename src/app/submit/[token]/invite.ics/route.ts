import type { NextRequest } from "next/server";

import { getOnboardingContext } from "@/features/portal/queries";
import { buildIcs, recordingEvent } from "@/lib/calendar";
import { attachment, notFoundResponse } from "@/lib/route-auth";
import { fileSlug } from "@/lib/show-notes";

/** The guest's recording as a calendar invite. The token in the URL is the credential. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/submit/[token]/invite.ics">) {
  const { token } = await ctx.params;
  const portal = await getOnboardingContext(token);
  const slot = portal?.slots.find((s) => s.mine);
  if (!portal || !slot) return notFoundResponse();

  const ics = buildIcs([
    recordingEvent({
      bookingId: portal.episode_guest_id,
      start: slot.starts_at,
      durationMinutes: slot.duration_minutes,
      organizationName: portal.organization.name,
      episodeTitle: portal.episode.title,
      meetingUrl: portal.episode.meeting_url,
    }),
  ]);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": attachment(`${fileSlug(portal.episode.title)}-recording.ics`),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
