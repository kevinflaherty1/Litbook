import "server-only";

import { randomBytes } from "node:crypto";

import { onboardingLinkEmail } from "@/features/bookings/guest-emails";
import { emailConfigured, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sends due guest reminders. Each claimed booking gets a fresh link; it
 * replaces the old one only after the email was delivered, so a failed send
 * leaves the guest's current link working.
 */
export async function sendDueReminders(limit = 50) {
  if (!emailConfigured) return { skipped: "email not configured", claimed: 0, sent: 0, failed: 0 };

  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("claim_onboarding_reminders", { p_limit: limit });
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const r of due) {
    // Same shape as public.generate_token(): 32 random bytes, base64url.
    const token = randomBytes(32).toString("base64url");
    const url = new URL(`/submit/${token}`, env.NEXT_PUBLIC_SITE_URL).toString();
    const delivery = await sendEmail({
      to: r.guest_email,
      ...onboardingLinkEmail({
        organizationName: r.organization_name,
        episodeTitle: r.episode_title,
        guestName: r.guest_name,
        url,
        reminderNumber: r.reminder_number,
      }),
    });
    if (!delivery.sent) {
      failed++;
      continue;
    }
    const { error: setError } = await admin.rpc("set_onboarding_token", {
      p_episode_guest_id: r.episode_guest_id,
      p_token: token,
    });
    if (setError) {
      failed++;
      console.error(
        JSON.stringify({
          level: "error",
          source: "reminders",
          booking: r.episode_guest_id,
          message: setError.message,
        }),
      );
      continue;
    }
    sent++;
  }

  const result = { claimed: due.length, sent, failed };
  console.info(JSON.stringify({ source: "reminders", ...result }));
  return result;
}
