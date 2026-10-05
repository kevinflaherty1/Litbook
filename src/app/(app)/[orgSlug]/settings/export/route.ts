import type { NextRequest } from "next/server";

import { buildWorkspaceExport } from "@/features/privacy/exports";
import { getOrgForRoute, notFoundResponse } from "@/lib/route-auth";
import { zipResponse } from "@/lib/zip-stream";

/** Owners and admins download everything the workspace holds (records and files). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[orgSlug]/settings/export">) {
  const { orgSlug } = await ctx.params;
  const access = await getOrgForRoute(orgSlug);
  if (!access) return notFoundResponse();
  if (access.role === "member")
    return new Response("Only owners and admins can export the workspace.", { status: 403 });

  const date = new Date().toISOString().slice(0, 10);
  return zipResponse(`litbook-${access.org.slug}-${date}.zip`, (add) =>
    buildWorkspaceExport(access.supabase, access.org, add),
  );
}
