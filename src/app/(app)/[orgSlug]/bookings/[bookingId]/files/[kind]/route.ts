import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getBookingAssets, getGuestFileUrl } from "@/features/bookings/queries";
import { getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { ASSET_KINDS } from "@/schemas/assets";

/** Redirects to a 60-second signed URL that downloads one of the guest's extra files. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/[orgSlug]/bookings/[bookingId]/files/[kind]">,
) {
  const { orgSlug, bookingId, kind } = await ctx.params;
  const parsedKind = z.enum(ASSET_KINDS).safeParse(kind);
  if (!parsedKind.success) return notFoundResponse();
  const access = await getOrgForRoute(orgSlug, bookingId);
  if (!access) return notFoundResponse();

  const asset = (await getBookingAssets(access.org.id, bookingId)).find((a) => a.kind === parsedKind.data);
  if (!asset) return notFoundResponse();

  const url = await getGuestFileUrl(asset.path, { download: asset.file_name, expiresIn: 60 });
  if (!url) return notFoundResponse();
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
