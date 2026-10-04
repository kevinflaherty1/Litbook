"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { isPgError, PG } from "@/lib/errors";
import { authedAction, orgAction } from "@/lib/safe-action";
import {
  acceptInvitationSchema,
  changeRoleSchema,
  inviteMemberSchema,
  removeMemberSchema,
  revokeInvitationSchema,
  updateProfileSchema,
} from "@/schemas/team";

export const inviteMember = orgAction(
  inviteMemberSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org, user }) => {
    const { count } = await supabase
      .from("organization_members")
      .select("user_id, profiles!inner(email)", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("profiles.email", input.email);
    if (count) return fail("That person is already on your team.", { email: ["Already a member."] });

    const { data: token, error } = await supabase.rpc("create_invitation", {
      p_org: org.id,
      p_email: input.email,
      p_role: input.role,
    });
    if (error) throw error;

    const inviteUrl = new URL(`/invite/${token}`, env.NEXT_PUBLIC_SITE_URL).toString();
    const { data: orgRow } = await supabase.from("organizations").select("name").eq("id", org.id).single();
    const orgName = orgRow?.name ?? "a Litbook workspace";

    const { sent } = await sendEmail({
      to: input.email,
      subject: `You're invited to join ${orgName} on Litbook`,
      text: `${user.email ?? "A teammate"} invited you to join ${orgName} on Litbook.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
      html: `<p>${escapeHtml(user.email ?? "A teammate")} invited you to join <strong>${escapeHtml(orgName)}</strong> on Litbook.</p><p><a href="${inviteUrl}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
    });

    refresh();
    // The raw token can't be recovered later, so return the link for the
    // inviter to copy (essential when email isn't configured).
    return ok({ inviteUrl, emailed: sent });
  },
);

export const revokeInvitation = orgAction(
  revokeInvitationSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    const { error } = await supabase
      .from("organization_invitations")
      .delete()
      .eq("id", input.invitationId)
      .eq("organization_id", org.id);
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);

export const changeMemberRole = orgAction(
  changeRoleSchema,
  { roles: ["owner"] },
  async (input, { supabase, org }) => {
    const { data, error } = await supabase
      .from("organization_members")
      .update({ role: input.role })
      .eq("organization_id", org.id)
      .eq("user_id", input.userId)
      .select("user_id");

    if (isPgError(error, PG.checkViolation)) {
      return fail("Your workspace needs at least one owner. Promote someone else first.");
    }
    if (error) throw error;
    if (!data.length) return fail("That member couldn't be updated.");
    refresh();
    return ok(undefined);
  },
);

/** Removes a teammate, or leaves the workspace when userId is yourself. */
export const removeMember = orgAction(
  removeMemberSchema,
  {},
  async (input, { supabase, org, user, role }) => {
    const isSelf = input.userId === user.id;
    if (!isSelf && role === "member") return fail("You don't have permission to do that.");

    const { data, error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", org.id)
      .eq("user_id", input.userId)
      .select("user_id");

    if (isPgError(error, PG.checkViolation)) {
      return fail("Your workspace needs at least one owner. Promote someone else first.");
    }
    if (error) throw error;
    // RLS silently skips rows you may not delete (e.g. an admin removing an owner).
    if (!data.length) return fail("You don't have permission to remove that member.");

    if (isSelf) redirect("/dashboard");
    refresh();
    return ok(undefined);
  },
);

export const acceptInvitation = authedAction(acceptInvitationSchema, async (input, { supabase }) => {
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: input.token });
  if (isPgError(error, PG.noDataFound)) {
    return fail("This invitation is invalid, expired, or was sent to a different email address.");
  }
  if (error) throw error;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", orgId)
    .single();
  if (orgError) throw orgError;

  redirect(`/${org.slug}`);
});

export const updateProfile = authedAction(updateProfileSchema, async (input, { supabase, user }) => {
  const { error } = await supabase.from("profiles").update({ full_name: input.fullName }).eq("id", user.id);
  if (error) throw error;
  refresh();
  return ok(undefined);
});
