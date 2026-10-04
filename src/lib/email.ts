import "server-only";

import { serverEnv } from "@/lib/env.server";

type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

/** Whether emails actually go anywhere (Resend, or Mailpit in development). */
export const emailConfigured = !!(serverEnv.RESEND_API_KEY || serverEnv.MAILPIT_URL);

/**
 * Sends a transactional email via Resend. Without RESEND_API_KEY it delivers
 * to the local Mailpit inbox when MAILPIT_URL is set (dev and CI), and
 * otherwise logs the email and returns { sent: false } so callers can fall
 * back to showing the link in the UI.
 */
export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  if (!serverEnv.RESEND_API_KEY && serverEnv.MAILPIT_URL) return sendToMailpit(email);
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
    body: JSON.stringify({
      from: serverEnv.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    console.error("[email] Resend error", res.status, await res.text());
    return { sent: false };
  }
  return { sent: true };
}

async function sendToMailpit(email: Email): Promise<{ sent: boolean }> {
  const from = serverEnv.EMAIL_FROM.match(/^(.*?)\s*<(.+)>$/);
  try {
    const res = await fetch(new URL("/api/v1/send", serverEnv.MAILPIT_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: from ? { Name: from[1], Email: from[2] } : { Email: serverEnv.EMAIL_FROM },
        To: [{ Email: email.to }],
        Subject: email.subject,
        Text: email.text,
        HTML: email.html,
        ...(email.replyTo ? { ReplyTo: [{ Email: email.replyTo }] } : {}),
      }),
    });
    if (!res.ok) console.error("[email] Mailpit error", res.status, await res.text());
    return { sent: res.ok };
  } catch (error) {
    console.error("[email] Mailpit unreachable", error);
    return { sent: false };
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
