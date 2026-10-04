import "server-only";

import { z } from "zod";

const serverSchema = z.object({
  // Secret key (sb_secret_...) or legacy service_role JWT. Bypasses RLS.
  SUPABASE_SECRET_KEY: z.string().min(1),
  // Optional: without it, invitation emails are logged and the invite link is
  // shown to the inviter to share manually.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Litbook <onboarding@resend.dev>"),
});

export const serverEnv = serverSchema.parse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
});
