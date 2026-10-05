import "server-only";

import { formatUtc } from "@/lib/calendar";
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
    const recipients = await hostRecipients(ctx);
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

/** The teammate who booked the guest, or the workspace owners if they've left. */
async function hostRecipients(ctx: OnboardingContext) {
  const { data: members, error } = await createAdminClient()
    .from("organization_members")
    .select("user_id, role, profiles!inner(email)")
    .eq("organization_id", ctx.organization_id);
  if (error) throw error;

  const booker = members.find((m) => m.user_id === ctx.created_by);
  return (booker ? [booker] : members.filter((m) => m.role === "owner"))
    .map((m) => m.profiles.email)
    .filter((email): email is string => !!email);
}

/**
 * After a guest picks (or gives up) a recording time: tells the host, and
 * sends the guest a confirmation with a calendar invite. Never throws.
 */
export async function notifySchedule(
  ctx: OnboardingContext,
  change: { startsAt: string; durationMinutes: number; ics: string } | { released: true },
) {
  const guest = ctx.guest.full_name;
  const episodeUrl = new URL(
    `/${ctx.organization.slug}/episodes/${ctx.episode.id}#schedule`,
    env.NEXT_PUBLIC_SITE_URL,
  ).toString();
  try {
    const recipients = await hostRecipients(ctx);
    const what =
      "released" in change
        ? `${guest} gave up their recording time for "${ctx.episode.title}"`
        : `${guest} picked ${formatUtc(change.startsAt)} to record "${ctx.episode.title}"`;
    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: what,
          text: `${what}.\n\nSee the schedule: ${episodeUrl}`,
          html: `<p>${escapeHtml(what)}.</p><p><a href="${episodeUrl}">See the schedule in Litbook</a></p>`,
        }),
      ),
    );

    if ("released" in change || !ctx.guest.email) return;
    const when = formatUtc(change.startsAt);
    const join = ctx.episode.meeting_url
      ? `Join here when it's time: ${ctx.episode.meeting_url}`
      : "Your host will send you the link to join.";
    await sendEmail({
      to: ctx.guest.email,
      replyTo: recipients[0],
      subject: `You're booked: recording "${ctx.episode.title}" with ${ctx.organization.name}`,
      text: `Hi ${guest.split(" ")[0]},\n\nYou're booked to record "${ctx.episode.title}" with ${ctx.organization.name} on ${when} (${change.durationMinutes} minutes).\n\n${join}\n\nThe attached invite adds it to your calendar in your own time zone.`,
      html: `<p>Hi ${escapeHtml(guest.split(" ")[0])},</p><p>You're booked to record <strong>${escapeHtml(ctx.episode.title)}</strong> with ${escapeHtml(ctx.organization.name)} on <strong>${escapeHtml(when)}</strong> (${change.durationMinutes} minutes).</p><p>${escapeHtml(join)}</p><p style="color:#71717a;font-size:13px">The attached invite adds it to your calendar in your own time zone.</p>`,
      attachments: [
        { filename: "recording.ics", content: change.ics, contentType: "text/calendar; charset=utf-8" },
      ],
    });
  } catch (error) {
    console.error("[portal] could not send scheduling emails", error);
  }
}
