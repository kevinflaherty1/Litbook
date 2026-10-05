import type { NextRequest } from "next/server";

import { buildGuestExport } from "@/features/privacy/exports";
import { getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { fileSlug } from "@/lib/show-notes";
import { zipResponse } from "@/lib/zip-stream";

/** Everything the workspace holds about one guest, e.g. to answer an access request. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[orgSlug]/guests/[guestId]/export">) {
  const { orgSlug, guestId } = await ctx.params;
  const access = await getOrgForRoute(orgSlug, guestId);
  if (!access) return notFoundResponse();

  const { data: guest, error } = await access.supabase
    .from("guests")
    .select("full_name")
    .eq("organization_id", access.org.id)
    .eq("id", guestId)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return notFoundResponse();

  return zipResponse(`guest-data-${fileSlug(guest.full_name)}.zip`, async (add) => {
    await buildGuestExport(access.supabase, access.org, guestId, add);
  });
}
