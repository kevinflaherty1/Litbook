import "server-only";

import { escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingContext } from "@/features/portal/queries";

/**
 * Emails the teammate who booked the guest (or the workspace owners, if they
 * have left) that the guest submitted. Never throws: a failed notification
 * mustn't fail the guest's submission.
 */
export async function notifyHostOfSubmission(
  ctx: OnboardingContext,
  { displayName, isUpdate }: { displayName: string; isUpdate: boolean },
) {
  try {
    const { data: members, error } = await createAdminClient()
      .from("organization_members")
      .select("user_id, role, profiles!inner(email)")
      .eq("organization_id", ctx.organization_id);
    if (error) throw error;

    const booker = members.find((m) => m.user_id === ctx.created_by);
    const recipients = (booker ? [booker] : members.filter((m) => m.role === "owner"))
      .map((m) => m.profiles.email)
      .filter((email): email is string => !!email);
    if (!recipients.length) return;

    const url = new URL(
      `/${ctx.organization.slug}/episodes/${ctx.episode.id}`,
      env.NEXT_PUBLIC_SITE_URL,
    ).toString();
    const verb = isUpdate ? "updated their guest details" : "sent their guest details";
    const subject = `${displayName} ${verb} for "${ctx.episode.title}"`;

    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject,
          text: `${displayName} ${verb} for "${ctx.episode.title}", including their signed release.\n\nReview them: ${url}`,
          html: `<p><strong>${escapeHtml(displayName)}</strong> ${verb} for <strong>${escapeHtml(ctx.episode.title)}</strong>, including their signed release.</p><p><a href="${url}">Review them in Litbook</a></p>`,
        }),
      ),
    );
  } catch (error) {
    console.error("[portal] could not notify host", error);
  }
}
