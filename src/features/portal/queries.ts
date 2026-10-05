import "server-only";

import { cache } from "react";
import { z } from "zod";

import { planAllows } from "@/lib/plans";
import { billingEnabled } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_STATUSES } from "@/schemas/booking";
import { ASSET_KINDS } from "@/schemas/assets";
import { customFieldSchema } from "@/schemas/custom-fields";
import { onboardingTokenSchema } from "@/schemas/portal";

const contextSchema = z.object({
  episode_guest_id: z.uuid(),
  organization_id: z.uuid(),
  status: z.enum(ONBOARDING_STATUSES),
  is_locked: z.boolean(),
  created_by: z.uuid().nullable(),
  organization: z.object({
    name: z.string(),
    slug: z.string(),
    logo_path: z.string().nullable(),
    brand_color: z.string().nullable(),
    portal_welcome: z.string().nullable(),
    requested_assets: z.array(z.enum(ASSET_KINDS)),
  }),
  episode: z.object({ id: z.uuid(), title: z.string(), recording_at: z.string().nullable() }),
  guest: z.object({ full_name: z.string(), email: z.string().nullable() }),
  release: z.object({ text: z.string(), version: z.number() }),
  custom_fields: z.array(customFieldSchema),
  assets: z.array(
    z.object({ kind: z.enum(ASSET_KINDS), path: z.string(), file_name: z.string(), size_bytes: z.number() }),
  ),
  submission: z
    .object({
      display_name: z.string().nullable(),
      headline: z.string().nullable(),
      short_bio: z.string().nullable(),
      long_bio: z.string().nullable(),
      pronouns: z.string().nullable(),
      name_pronunciation: z.string().nullable(),
      website_url: z.string().nullable(),
      social_links: z.record(z.string(), z.string()),
      headshot_path: z.string().nullable(),
      custom_answers: z.record(z.string(), z.union([z.string(), z.boolean()])),
      release_signed_name: z.string().nullable(),
      release_signed_at: z.string().nullable(),
    })
    .nullable(),
});

export type OnboardingContext = z.infer<typeof contextSchema>;

/**
 * Everything the portal needs for a token, or null when the link is unknown,
 * expired, or cancelled. Uses the service role: the token is the credential.
 */
export const getOnboardingContext = cache(async (token: string): Promise<OnboardingContext | null> => {
  if (!onboardingTokenSchema.safeParse(token).success) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_onboarding_context", { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const ctx = contextSchema.parse(data);
  if (!billingEnabled) return ctx;

  // Pro features are hidden from guests when the workspace's plan doesn't include them
  // (e.g. after a downgrade). Their settings and past answers are kept.
  const { data: org, error: planError } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", ctx.organization_id)
    .single();
  if (planError) throw planError;
  const allows = (f: Parameters<typeof planAllows>[1]) => planAllows(org.plan, f, true);
  return {
    ...ctx,
    organization: {
      ...ctx.organization,
      ...(allows("branding") ? {} : { logo_path: null, brand_color: null, portal_welcome: null }),
      requested_assets: allows("guest_files") ? ctx.organization.requested_assets : [],
    },
    custom_fields: allows("custom_questions") ? ctx.custom_fields : [],
  };
});

/** A short-lived URL for showing the guest the headshot they already uploaded. */
export async function getHeadshotPreviewUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await createAdminClient()
    .storage.from("guest-assets")
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.error("[portal] could not sign headshot preview", error);
    return null;
  }
  return data.signedUrl;
}

export async function recordOnboardingVisit(token: string) {
  const { error } = await createAdminClient().rpc("record_onboarding_visit", { p_token: token });
  if (error) console.error("[portal] could not record visit", error);
}
