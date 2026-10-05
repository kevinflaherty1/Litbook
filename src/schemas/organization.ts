import { z } from "zod";

// Keep in sync with organizations_slug_not_reserved in
// supabase/migrations/20261004010000_reserved_slugs_and_invitation_preview.sql
export const RESERVED_SLUGS = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "blog",
  "dashboard",
  "docs",
  "help",
  "invite",
  "login",
  "logout",
  "new",
  "onboarding",
  "pricing",
  "privacy",
  "settings",
  "signup",
  "static",
  "submit",
  "support",
  "terms",
  "www",
]);

// Mirrors the DB check: 3–48 chars, lowercase letters, digits and inner hyphens.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for your organization.")
  .max(120, "Keep it under 120 characters.");

export const orgSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(48, "Use at most 48 characters.")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens (not at the start or end).")
  .refine((slug) => !RESERVED_SLUGS.has(slug), "That URL is reserved. Try another.");

export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  slug: orgSlugSchema,
});

export const updateOrganizationSchema = z.object({
  orgId: z.uuid(),
  name: orgNameSchema,
  slug: orgSlugSchema,
});

export const updateReleaseFormSchema = z.object({
  orgId: z.uuid(),
  releaseFormText: z
    .string()
    .trim()
    .min(1, "The release form can't be empty.")
    .max(20000, "Keep the release form under 20,000 characters."),
});

/** "The Daily Grind Podcast!" → "the-daily-grind-podcast" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;
export type UpdateReleaseFormInput = z.input<typeof updateReleaseFormSchema>;

export const updateGuestRemindersSchema = z.object({ orgId: z.uuid(), enabled: z.boolean() });

export const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // matches the org-branding bucket's file_size_limit

export const brandColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v || null)
  .refine((v) => v === null || /^#[0-9a-f]{6}$/.test(v), "Use a hex colour like #4f46e5.");

export const updateBrandingSchema = z.object({
  orgId: z.uuid(),
  /** Storage key of a newly uploaded logo; "" keeps the current one. */
  logoPath: z.string().max(300).default(""),
  removeLogo: z.boolean().default(false),
  brandColor: brandColorSchema,
  portalWelcome: z
    .string()
    .trim()
    .max(1000, "Keep it under 1,000 characters.")
    .transform((v) => v || null),
});
export type UpdateBrandingInput = z.input<typeof updateBrandingSchema>;
