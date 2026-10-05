"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { getRequestMeta, rateLimit } from "@/lib/rate-limit";
import { publicAction } from "@/lib/safe-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyHostOfSubmission, notifySchedule } from "@/features/portal/notify";
import { buildIcs, recordingEvent } from "@/lib/calendar";
import { pickSlotSchema, releaseSlotSchema } from "@/schemas/scheduling";
import { getOnboardingContext } from "@/features/portal/queries";
import { fieldErrorsOf } from "@/lib/safe-action";
import { ASSET_SPECS, assetUploadSchema } from "@/schemas/assets";
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

/** Like createHeadshotUpload, for the extra files the workspace asked for. */
export const createAssetUpload = publicAction(assetUploadSchema, async (input) => {
  if (!(await withinLimits(input.token, "upload"))) return fail(SLOW_DOWN);

  const ctx = await getOnboardingContext(input.token);
  if (!ctx) return fail(LINK_INVALID);
  if (ctx.is_locked) return fail(LOCKED);
  if (!ctx.organization.requested_assets.includes(input.kind)) {
    return fail("Your host isn't asking for this file anymore.");
  }

  const ext = ASSET_SPECS[input.kind].types[input.contentType];
  const path = `${ctx.organization_id}/${ctx.episode_guest_id}/${input.kind}-${randomUUID()}.${ext}`;
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
      assets: Object.fromEntries(
        Object.entries(input.assets).map(([kind, file]) => [
          kind,
          file ? { path: file.path, file_name: file.fileName } : null,
        ]),
      ),
      release_accepted: input.releaseAccepted,
      release_signed_name: input.releaseSignedName,
    },
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });

  if (isPgError(error, PG.noDataFound)) return fail(LINK_INVALID);
  if (isPgError(error, PG.objectNotInPrerequisiteState)) return fail(LOCKED);
  if (isPgError(error, PG.invalidParameter)) {
    return fail("One of your files didn't finish uploading. Please add it again.", {
      headshotPath: input.headshotPath ? ["Please upload your headshot again."] : undefined,
    });
  }
  if (error) throw error;

  after(async () => {
    // A replaced headshot is no longer referenced; remove it.
    // Replaced or removed files are no longer referenced; remove them.
    const stale = ctx.assets.filter((a) => a.kind in input.assets && input.assets[a.kind]?.path !== a.path);
    const unused = [
      ...(input.headshotPath && previousHeadshot && previousHeadshot !== input.headshotPath
        ? [previousHeadshot]
        : []),
      ...stale.map((a) => a.path),
    ];
    if (unused.length) {
      const { error: removeError } = await admin.storage.from("guest-assets").remove(unused);
      if (removeError) console.error("[portal] could not remove replaced files", removeError);
    }
    await notifyHostOfSubmission(ctx, { displayName: input.displayName, isUpdate: !!ctx.submission });
  });

  redirect(`/submit/${input.token}/done`);
});

/** The guest takes one of the offered recording times (replacing any earlier pick). */
export const pickRecordingSlot = publicAction(pickSlotSchema, async (input) => {
  if (!(await withinLimits(input.token, "submit"))) return fail(SLOW_DOWN);
  const ctx = await getOnboardingContext(input.token);
  if (!ctx) return fail(LINK_INVALID);
  if (ctx.slots.find((s) => s.mine)?.id === input.slotId) return ok(undefined);

  const { data, error } = await createAdminClient().rpc("pick_recording_slot", {
    p_token: input.token,
    p_slot_id: input.slotId,
  });
  if (isPgError(error, PG.uniqueViolation)) return fail("Someone just took that time. Please pick another.");
  if (isPgError(error, PG.noDataFound)) return fail("That time is no longer available. Please pick another.");
  if (error) throw error;

  const slot = data as { starts_at: string; duration_minutes: number };
  after(() =>
    notifySchedule(ctx, {
      startsAt: slot.starts_at,
      durationMinutes: slot.duration_minutes,
      ics: buildIcs([
        recordingEvent({
          bookingId: ctx.episode_guest_id,
          start: slot.starts_at,
          durationMinutes: slot.duration_minutes,
          organizationName: ctx.organization.name,
          episodeTitle: ctx.episode.title,
          meetingUrl: ctx.episode.meeting_url,
        }),
      ]),
    }),
  );
  refresh();
  return ok(undefined);
});

/** The guest gives up their recording time (e.g. to tell the host none work). */
export const releaseRecordingSlot = publicAction(releaseSlotSchema, async (input) => {
  if (!(await withinLimits(input.token, "submit"))) return fail(SLOW_DOWN);
  const ctx = await getOnboardingContext(input.token);
  if (!ctx) return fail(LINK_INVALID);
  if (!ctx.slots.some((s) => s.mine)) return ok(undefined);

  const { error } = await createAdminClient().rpc("release_recording_slot", { p_token: input.token });
  if (isPgError(error, PG.noDataFound)) return fail(LINK_INVALID);
  if (error) throw error;
  after(() => notifySchedule(ctx, { released: true }));
  refresh();
  return ok(undefined);
});
