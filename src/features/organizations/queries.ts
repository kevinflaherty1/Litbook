import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export type OrgSummary = { id: string; name: string; slug: string; role: OrgRole };

/** Organizations the current user belongs to, oldest membership first. */
export const getMyOrganizations = cache(async (): Promise<OrgSummary[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, created_at, organizations!inner(id, name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map((m) => ({ ...m.organizations, role: m.role }));
});

/**
 * Resolves /[orgSlug] for the current user. 404s when the org doesn't exist
 * or the user isn't a member, so org existence isn't leaked.
 */
export const requireOrgMembership = cache(async (slug: string) => {
  const user = await requireUser(`/${slug}`);
  const supabase = await createClient();

  // RLS hides orgs the user isn't a member of, so a miss here means "no access".
  const { data: org, error } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, logo_url, release_form_text, release_form_version, subscription_status, guest_reminders_enabled, organization_members!inner(role)",
    )
    .eq("slug", slug)
    .eq("organization_members.user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!org) notFound();

  const { organization_members, ...rest } = org;
  const role = organization_members[0].role;
  return {
    user,
    org: rest,
    role,
    canManage: role === "owner" || role === "admin",
  };
});

export type OrgContext = Awaited<ReturnType<typeof requireOrgMembership>>;
