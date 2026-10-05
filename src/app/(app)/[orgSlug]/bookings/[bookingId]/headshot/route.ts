import { NextResponse, type NextRequest } from "next/server";

import { getBooking, getGuestFileUrl } from "@/features/bookings/queries";
import { notFoundResponse, getOrgForRoute } from "@/lib/route-auth";
import { fileSlug } from "@/lib/show-notes";

/** Redirects to a 60-second signed URL that downloads the guest's headshot. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[orgSlug]/bookings/[bookingId]/headshot">) {
  const { orgSlug, bookingId } = await ctx.params;
  const access = await getOrgForRoute(orgSlug, bookingId);
  if (!access) return notFoundResponse();

  const booking = await getBooking(access.org.id, bookingId);
  const path = booking?.submission?.headshot_path;
  if (!booking || !path) return notFoundResponse();

  const ext = path.split(".").pop() ?? "jpg";
  const url = await getGuestFileUrl(path, {
    download: `${fileSlug(booking.submission?.display_name || booking.guests.full_name)}.${ext}`,
    expiresIn: 60,
  });
  if (!url) return notFoundResponse();
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
