import "server-only";

import { escapeHtml } from "@/lib/email";

type LinkEmail = {
  organizationName: string;
  episodeTitle: string;
  guestName: string;
  url: string;
  /** 1 or 2 for reminders; omitted for the first email. */
  reminderNumber?: number;
};

/** The email that carries a guest's onboarding link (first send or reminder). */
export function onboardingLinkEmail({
  organizationName,
  episodeTitle,
  guestName,
  url,
  reminderNumber,
}: LinkEmail) {
  const firstName = guestName.split(" ")[0];
  const isReminder = !!reminderNumber;
  const subject = isReminder
    ? `Reminder: your guest details for ${organizationName}`
    : `${organizationName}: a few details before your episode`;
  const intro = isReminder
    ? `Just a friendly reminder: ${organizationName} still needs a few details from you for "${episodeTitle}".`
    : `Thanks for coming on ${organizationName}! Before we record "${episodeTitle}", please share your bio, a headshot and your social links, and sign our guest release.`;
  const note = isReminder
    ? "Use this new link; any earlier link we sent has been replaced."
    : "It takes about five minutes, and you don't need an account.";

  return {
    subject,
    text: `Hi ${firstName},\n\n${intro}\n\n${url}\n\n${note}\n\n${organizationName}`,
    html: `<p>Hi ${escapeHtml(firstName)},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none">Add my details</a></p>
<p style="color:#71717a;font-size:13px">${escapeHtml(note)} Or paste this link into your browser:<br>${escapeHtml(url)}</p>
<p>${escapeHtml(organizationName)}</p>`,
  };
}
