import "server-only";

import { z } from "zod";

const serverSchema = z
  .object({
    // Secret key (sb_secret_...) or legacy service_role JWT. Bypasses RLS.
    SUPABASE_SECRET_KEY: z.string().min(1),
    // Optional: without it, invitation emails are logged and the invite link is
    // shown to the inviter to share manually.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).default("Litbook <onboarding@resend.dev>"),
    // Development/CI only: deliver emails to the local Mailpit inbox (from
    // `pnpm db:start`) when RESEND_API_KEY isn't set. Never set in production.
    MAILPIT_URL: z.url().optional(),
    // Vercel Cron sends it as a bearer token to /api/cron/*. Unset: cron routes 404.
    CRON_SECRET: z.string().min(16).optional(),
    // Billing is on only when STRIPE_SECRET_KEY is set. Without it (local dev,
    // CI), there's no paywall and the billing page says billing isn't set up.
    STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    STRIPE_PRICE_ID: z.string().startsWith("price_").optional(),
    STRIPE_TRIAL_DAYS: z.coerce.number().int().min(0).max(730).default(14),
  })
  .superRefine((env, ctx) => {
    if (env.STRIPE_SECRET_KEY && (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PRICE_ID)) {
      ctx.addIssue({
        code: "custom",
        message: "STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_ID are required when STRIPE_SECRET_KEY is set.",
      });
    }
  });

export const serverEnv = serverSchema.parse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  MAILPIT_URL: process.env.MAILPIT_URL || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID || undefined,
  STRIPE_TRIAL_DAYS: process.env.STRIPE_TRIAL_DAYS || undefined,
});
