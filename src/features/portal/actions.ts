"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { getRequestMeta, rateLimit } from "@/lib/rate-limit";
import { publicAction } from "@/lib/safe-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyHostOfSubmission } from "@/features/portal/notify";
import { getOnboardingContext } from "@/features/portal/queries";
import { fieldErrorsOf } from "@/lib/safe-action";
import { customAnswersSchema } from "@/schemas/custom-fields";
import { HEADSHOT_EXTENSIONS, headshotUploadSchema, onboardingSubmissionSchema } from "@/schemas/portal";

const LINK_INVALID = "This link is no longer valid. Ask your host to send you a new one.";
const LOCKED = "Your host has already finalized your details, so they can't be changed here.";
const SLOW_DOWN = "Too many attempts. Please wait a few minutes and try again.";

/** Per-link and per-IP limits for the public portal. */
async function withinLimits(token: string, kind: "upload" | "submit") {
  const { ip } = await getRequestMeta();
  const [byToken, byIp] = await Promise.all([
    rateLimit(`portal-${kind}:${token}`, kind === "upload" ? 20 : 30, 60 * 60),
    ip ? rateLimit(`portal-ip:${ip}`, 120, 60 * 60) : true,
  ]);
  return byToken && byIp;
}

/**
 * Step 1 of a headshot upload: check the link, then mint a signed upload URL
 * under this booking's prefix. The browser uploads directly to Storage.
 */
export const createHeadshotUpload = publicAction(headshotUploadSchema, async (input) => {
  if (!(await withinLimits(input.token, "upload"))) return fail(SLOW_DOWN);

  const ctx = await getOnboardingContext(input.token);
  if (!ctx) return fail(LINK_INVALID);
  if (ctx.is_locked) return fail(LOCKED);

  const path = `${ctx.organization_id}/${ctx.episode_guest_id}/${randomUUID()}.${HEADSHOT_EXTENSIONS[input.contentType]}`;
  const { data, error } = await createAdminClient().storage.from("guest-assets").createSignedUploadUrl(path);
  if (error) throw error;

  return ok({ path: data.path, uploadToken: data.token });
});

/** Saves the guest's details and signature, then shows the thank-you page. */
export const submitOnboarding = publicAction(onboardingSubmissionSchema, async (input) => {
  if (!(await withinLimits(input.token, "submit"))) return fail(SLOW_DOWN);

  const ctx = await getOnboardingContext(input.token);
  if (!ctx) return fail(LINK_INVALID);
  if (ctx.is_locked) return fail(LOCKED);

  const previousHeadshot = ctx.submission?.headshot_path ?? null;
  if (!input.headshotPath && !previousHeadshot) {
    return fail("Please add a headshot.", { headshotPath: ["Please add a headshot."] });
  }

  // Check answers against the questions the guest was actually shown.
  const answers = customAnswersSchema(ctx.custom_fields).safeParse(input.customAnswers);
  if (!answers.success) {
    const errors = Object.fromEntries(
      Object.entries(fieldErrorsOf(answers.error)).map(([key, messages]) => [
        `customAnswers.${key}`,
        messages,
      ]),
    );
    return fail("Please answer the highlighted questions.", errors);
  }
  // Keep answers to questions that have since been archived.
  const activeIds = new Set(ctx.custom_fields.map((f) => f.id));
  const keptAnswers = Object.fromEntries(
    Object.entries(ctx.submission?.custom_answers ?? {}).filter(([id]) => !activeIds.has(id)),
  );

  const { ip, userAgent } = await getRequestMeta();
  const admin = createAdminClient();
  const { error } = await admin.rpc("submit_onboarding", {
    p_token: input.token,
    p_payload: {
      display_name: input.displayName,
      headline: input.headline,
      short_bio: input.shortBio,
      long_bio: input.longBio,
      pronouns: input.pronouns,
      name_pronunciation: input.namePronunciation,
      website_url: input.websiteUrl,
      social_links: input.socialLinks,
      headshot_path: input.headshotPath,
      custom_answers: { ...keptAnswers, ...answers.data },
      release_accepted: input.releaseAccepted,
      release_signed_name: input.releaseSignedName,
    },
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });

  if (isPgError(error, PG.noDataFound)) return fail(LINK_INVALID);
  if (isPgError(error, PG.objectNotInPrerequisiteState)) return fail(LOCKED);
  if (isPgError(error, PG.invalidParameter)) {
    return fail("Your headshot didn't finish uploading. Please add it again.", {
      headshotPath: ["Please upload your headshot again."],
    });
  }
  if (error) throw error;

  after(async () => {
    // A replaced headshot is no longer referenced; remove it.
    if (input.headshotPath && previousHeadshot && previousHeadshot !== input.headshotPath) {
      const { error: removeError } = await admin.storage.from("guest-assets").remove([previousHeadshot]);
      if (removeError) console.error("[portal] could not remove old headshot", removeError);
    }
    await notifyHostOfSubmission(ctx, { displayName: input.displayName, isUpdate: !!ctx.submission });
  });

  redirect(`/submit/${input.token}/done`);
});
