import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export const getMembers = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, role, created_at, profiles!inner(full_name, email, avatar_url)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(({ profiles, ...m }) => ({ ...m, ...profiles }));
});

/** Pending invitations. RLS returns rows only to owners and admins. */
export const getPendingInvitations = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("organization_id", orgId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data.map((invite) => ({ ...invite, expired: new Date(invite.expires_at) < new Date() }));
});

export type Member = Awaited<ReturnType<typeof getMembers>>[number];
export type PendingInvitation = Awaited<ReturnType<typeof getPendingInvitations>>[number];
