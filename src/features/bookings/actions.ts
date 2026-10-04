"use server";

import { refresh } from "next/cache";

import { requireActiveSubscription } from "@/features/billing/gate";
import { fail, ok } from "@/lib/action-result";
import { env } from "@/lib/env";
import { isPgError, PG } from "@/lib/errors";
import { orgAction } from "@/lib/safe-action";
import { removeStoragePrefix } from "@/lib/storage";
import type { createClient } from "@/lib/supabase/server";
import {
  bookExistingGuestSchema,
  bookingRefSchema,
  bookNewGuestSchema,
  setBookingCancelledSchema,
  setBookingReadySchema,
} from "@/schemas/booking";
import { submissionContentSchema } from "@/schemas/portal";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const ALREADY_BOOKED = "That guest is already booked on this episode.";

async function insertBooking(supabase: ServerClient, orgId: string, episodeId: string, guestId: string) {
  // The composite foreign keys reject an episode or guest from another org.
  return supabase.from("episode_guests").insert({
    organization_id: orgId,
    episode_id: episodeId,
    guest_id: guestId,
  });
}

export const bookExistingGuest = orgAction(bookExistingGuestSchema, {}, async (input, { supabase, org }) => {
  const { error } = await insertBooking(supabase, org.id, input.episodeId, input.guestId);
  if (isPgError(error, PG.uniqueViolation)) return fail(ALREADY_BOOKED, { guestId: [ALREADY_BOOKED] });
  if (isPgError(error, PG.foreignKeyViolation)) return fail("That episode or guest no longer exists.");
  if (error) throw error;

  refresh();
  return ok(undefined);
});

/**
 * Books a guest who may not be in the directory yet. A guest with the same
 * email is reused rather than duplicated.
 */
export const bookNewGuest = orgAction(bookNewGuestSchema, {}, async (input, { supabase, org }) => {
  const findByEmail = async (email: string) => {
    const { data, error } = await supabase
      .from("guests")
      .select("id, full_name")
      .eq("organization_id", org.id)
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  let guest = input.email ? await findByEmail(input.email) : null;
  const reused = guest !== null;

  if (!guest) {
    const { data, error } = await supabase
      .from("guests")
      .insert({ organization_id: org.id, full_name: input.fullName, email: input.email })
      .select("id, full_name")
      .single();
    // Lost a race with someone adding the same email: use their row.
    if (isPgError(error, PG.uniqueViolation) && input.email) guest = await findByEmail(input.email);
    else if (error) throw error;
    else guest = data;
  }
  if (!guest) return fail("Something went wrong. Please try again.");

  const { error } = await insertBooking(supabase, org.id, input.episodeId, guest.id);
  if (isPgError(error, PG.uniqueViolation))
    return fail(`${guest.full_name} is already booked on this episode.`);
  if (isPgError(error, PG.foreignKeyViolation)) return fail("That episode no longer exists.");
  if (error) throw error;

  refresh();
  return ok({ guestName: guest.full_name, reused });
});

/**
 * Issues a fresh onboarding link. Only the token's hash is stored, so the URL
 * is returned once; issuing another invalidates the previous link.
 */
export const generateOnboardingLink = orgAction(bookingRefSchema, {}, async (input, { supabase, org }) => {
  const paywall = await requireActiveSubscription(supabase, org.id);
  if (paywall) return paywall;

  const { data: booking, error: bookingError } = await supabase
    .from("episode_guests")
    .select("status")
    .eq("organization_id", org.id)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return fail("That booking no longer exists.");
  if (booking.status === "cancelled") return fail("Restore this booking before sending a link.");
  if (booking.status === "ready") return fail("This booking is marked ready, so the guest can't edit it.");

  const { data: token, error } = await supabase.rpc("issue_onboarding_token", {
    p_episode_guest_id: input.bookingId,
  });
  if (error) throw error;

  refresh();
  return ok({ url: new URL(`/submit/${token}`, env.NEXT_PUBLIC_SITE_URL).toString() });
});

/** Cancels a booking (its link stops working) or restores a cancelled one. */
export const setBookingCancelled = orgAction(
  setBookingCancelledSchema,
  {},
  async (input, { supabase, org }) => {
    let status: "cancelled" | "pending" | "assets_submitted" = "cancelled";
    if (!input.cancelled) {
      const { count, error } = await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("episode_guest_id", input.bookingId);
      if (error) throw error;
      status = count ? "assets_submitted" : "pending";
    }

    const { data, error } = await supabase
      .from("episode_guests")
      .update({ status })
      .eq("organization_id", org.id)
      .eq("id", input.bookingId)
      .select("id");
    if (isPgError(error, PG.invalidParameter)) return fail("That booking can't be changed right now.");
    if (error) throw error;
    if (!data.length) return fail("That booking no longer exists.");

    refresh();
    return ok(undefined);
  },
);

/**
 * Removes a guest from an episode. Once they've submitted, the booking holds a
 * signed release, so it can only be cancelled, not deleted.
 */
export const removeBooking = orgAction(bookingRefSchema, {}, async (input, { supabase, org }) => {
  const { data, error } = await supabase
    .from("episode_guests")
    .delete()
    .eq("organization_id", org.id)
    .eq("id", input.bookingId)
    .is("submitted_at", null)
    .select("id");
  if (error) throw error;
  if (!data.length) {
    return fail("This guest has already submitted a signed release. Cancel the booking instead.");
  }
  // A headshot may have been uploaded without being submitted.
  await removeStoragePrefix(`${org.id}/${input.bookingId}/`);

  refresh();
  return ok(undefined);
});

/**
 * "Mark ready" locks the guest's submission (the portal stops accepting
 * edits); "Reopen" lets them edit again. Both need a submission to exist.
 */
export const setBookingReady = orgAction(setBookingReadySchema, {}, async (input, { supabase, org }) => {
  const { data, error } = await supabase
    .from("episode_guests")
    .update({ status: input.ready ? "ready" : "assets_submitted" })
    .eq("organization_id", org.id)
    .eq("id", input.bookingId)
    .neq("status", "cancelled")
    .select("id");
  if (isPgError(error, PG.invalidParameter)) return fail("The guest hasn't submitted anything yet.");
  if (error) throw error;
  if (!data.length) return fail("That booking can't be changed right now.");

  refresh();
  return ok(undefined);
});

/** Lets the host fix typos in what the guest submitted. The signed release is untouched. */
export const updateSubmissionContent = orgAction(
  submissionContentSchema,
  {},
  async (input, { supabase, org }) => {
    const { data, error } = await supabase
      .from("submissions")
      .update({
        display_name: input.displayName,
        headline: input.headline,
        short_bio: input.shortBio,
        long_bio: input.longBio,
        pronouns: input.pronouns,
        name_pronunciation: input.namePronunciation,
        website_url: input.websiteUrl,
        social_links: input.socialLinks,
      })
      .eq("organization_id", org.id)
      .eq("episode_guest_id", input.bookingId)
      .select("id");
    if (error) throw error;
    if (!data.length) return fail("There's no submission to edit yet.");

    refresh();
    return ok(undefined);
  },
);
