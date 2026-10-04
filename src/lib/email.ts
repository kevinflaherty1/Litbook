import "server-only";

import { serverEnv } from "@/lib/env.server";

type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends a transactional email via Resend. Without RESEND_API_KEY (local dev),
 * logs the email instead and returns { sent: false } so callers can fall back
 * to showing the link in the UI.
 */
export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  if (!serverEnv.RESEND_API_KEY) {
    console.info(
      `[email] RESEND_API_KEY not set; not sending "${email.subject}" to ${email.to}\n${email.text}`,
    );
    return { sent: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: serverEnv.EMAIL_FROM, ...email }),
  });

  if (!res.ok) {
    console.error("[email] Resend error", res.status, await res.text());
    return { sent: false };
  }
  return { sent: true };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
