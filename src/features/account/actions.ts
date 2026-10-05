"use server";

import { redirect } from "next/navigation";

import { fail } from "@/lib/action-result";
import { authedAction } from "@/lib/safe-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountWorkspaces } from "@/features/account/queries";
import { BillingNotConfiguredError, destroyOrganization } from "@/features/organizations/destroy";
import { deleteAccountSchema } from "@/schemas/account";

/**
 * Permanently deletes the signed-in user's account. Workspaces where they're
 * the only member are deleted with it; they're removed from the rest. Blocked
 * while they're the last owner of a workspace that has other members.
 */
export const deleteAccount = authedAction(deleteAccountSchema, async (input, { supabase, user }) => {
  if (!user.email || input.confirmEmail !== user.email.toLowerCase()) {
    return fail("That doesn't match your email address.", {
      confirmEmail: ["Type your email address exactly."],
    });
  }

  const workspaces = await getAccountWorkspaces(user.id);
  const blocked = workspaces.filter((w) => w.onDelete === "blocked");
  if (blocked.length) {
    return fail(
      `You're the only owner of ${blocked.map((w) => w.name).join(", ")}. Make someone else an owner or delete the workspace first.`,
    );
  }

  for (const w of workspaces.filter((w) => w.onDelete === "delete")) {
    try {
      await destroyOrganization(w.id);
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) {
        return fail(`${w.name} has a subscription but billing isn't configured here. Contact support.`);
      }
      throw error;
    }
  }

  // Cascades to the profile and memberships; created_by references become NULL.
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) throw error;

  // The user no longer exists; clear this browser's session cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?deleted=1");
});
