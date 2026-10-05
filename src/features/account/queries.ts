import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrgRole = Database["public"]["Enums"]["org_role"];

export type AccountWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  memberCount: number;
  /** What deleting the account does to this workspace. */
  onDelete: "leave" | "delete" | "blocked";
};

/**
 * The user's workspaces and what happens to each if they delete their
 * account: they leave it, it's deleted with them (they're its only member),
 * or deletion is blocked (they're the last owner and others remain).
 */
export async function getAccountWorkspaces(userId: string): Promise<AccountWorkspace[]> {
  const supabase = await createClient();
  const { data: mine, error } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(id, name, slug)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw error;
  if (!mine.length) return [];

  // RLS lets members read the roster of their own workspaces.
  const { data: roster, error: rosterError } = await supabase
    .from("organization_members")
    .select("organization_id, user_id, role")
    .in(
      "organization_id",
      mine.map((m) => m.organizations.id),
    );
  if (rosterError) throw rosterError;

  return mine.map((m) => {
    const others = roster.filter((r) => r.organization_id === m.organizations.id && r.user_id !== userId);
    const onDelete =
      m.role !== "owner" || others.some((r) => r.role === "owner")
        ? "leave"
        : others.length === 0
          ? "delete"
          : "blocked";
    return { ...m.organizations, role: m.role, memberCount: others.length + 1, onDelete };
  });
}
