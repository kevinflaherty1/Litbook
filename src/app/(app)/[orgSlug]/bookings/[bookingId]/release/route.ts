import type { NextRequest } from "next/server";

import { getBooking } from "@/features/bookings/queries";
import { buildReleasePdf } from "@/features/bookings/release-pdf";
import { attachment, getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { fileSlug } from "@/lib/show-notes";

/** The signed release as a PDF, for the host's records. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[orgSlug]/bookings/[bookingId]/release">) {
  const { orgSlug, bookingId } = await ctx.params;
  const access = await getOrgForRoute(orgSlug, bookingId);
  if (!access) return notFoundResponse();

  const booking = await getBooking(access.org.id, bookingId);
  const s = booking?.submission;
  if (!booking || !s?.release_signed_at || !s.release_signed_name) return notFoundResponse();

  const pdf = await buildReleasePdf({
    organization: access.org.name,
    episode: booking.episodes.title,
    guestName: s.display_name || booking.guests.full_name,
    guestEmail: booking.guests.email,
    signedName: s.release_signed_name,
    signedAt: s.release_signed_at,
    version: s.release_version,
    text: s.release_text_snapshot ?? "",
    ip: s.release_ip as string | null,
    userAgent: s.release_user_agent,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(`release-${fileSlug(booking.guests.full_name)}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
}
