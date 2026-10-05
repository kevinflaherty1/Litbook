import "server-only";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * For route handlers under /[orgSlug]: the signed-in user's org, or null when
 * they're signed out, not a member, or an id isn't a UUID. RLS hides other
 * orgs, so a miss means "no access".
 */
export async function getOrgForRoute(slug: string, ...ids: string[]) {
  if (ids.some((id) => !z.uuid().safeParse(id).success)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, organization_members!inner(role)")
    .eq("slug", slug)
    .eq("organization_members.user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { organization_members, ...org } = data;
  return { supabase, org, user, role: organization_members[0].role };
}

export function notFoundResponse() {
  return new Response("Not found", { status: 404 });
}

/** Content-Disposition for a download, with an ASCII fallback and a UTF-8 name. */
export function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
