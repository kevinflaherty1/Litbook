"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { getOrgPlan, requireActiveSubscription } from "@/features/billing/gate";
import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { limitMessage } from "@/lib/plans";
import { orgAction } from "@/lib/safe-action";
import { removeStoragePrefix } from "@/lib/storage";
import { createEpisodeSchema, deleteEpisodeSchema, updateEpisodeSchema } from "@/schemas/episode";

export const createEpisode = orgAction(createEpisodeSchema, {}, async (input, { supabase, org }) => {
  const paywall = await requireActiveSubscription(supabase, org.id);
  if (paywall) return paywall;

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      organization_id: org.id,
      title: input.title,
      description: input.description,
      episode_number: input.episodeNumber,
      status: input.status,
      recording_at: input.recordingAt,
      publish_at: input.publishAt,
      meeting_url: input.meetingUrl,
    })
    .select("id")
    .single();
  if (isPgError(error, PG.planLimitReached))
    return fail(limitMessage("episodes", await getOrgPlan(supabase, org.id)));
  if (error) throw error;

  redirect(`/${org.slug}/episodes/${data.id}`);
});

export const updateEpisode = orgAction(updateEpisodeSchema, {}, async (input, { supabase, org }) => {
  const { data, error } = await supabase
    .from("episodes")
    .update({
      title: input.title,
      description: input.description,
      episode_number: input.episodeNumber,
      status: input.status,
      recording_at: input.recordingAt,
      publish_at: input.publishAt,
      meeting_url: input.meetingUrl,
    })
    .eq("organization_id", org.id)
    .eq("id", input.episodeId)
    .select("id");
  if (error) throw error;
  if (!data.length) return fail("That episode no longer exists.");

  refresh();
  return ok(undefined);
});

export const deleteEpisode = orgAction(
  deleteEpisodeSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    // Storage files aren't removed by the cascade; collect the bookings first.
    const { data: bookings, error: bookingsError } = await supabase
      .from("episode_guests")
      .select("id")
      .eq("organization_id", org.id)
      .eq("episode_id", input.episodeId);
    if (bookingsError) throw bookingsError;

    const { data, error } = await supabase
      .from("episodes")
      .delete()
      .eq("organization_id", org.id)
      .eq("id", input.episodeId)
      .select("id");
    if (error) throw error;
    if (!data.length) return fail("That episode couldn't be deleted.");
    await Promise.all(bookings.map((b) => removeStoragePrefix(`${org.id}/${b.id}/`)));

    redirect(`/${org.slug}/episodes`);
  },
);
