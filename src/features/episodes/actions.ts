"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { orgAction } from "@/lib/safe-action";
import { createEpisodeSchema, deleteEpisodeSchema, updateEpisodeSchema } from "@/schemas/episode";

export const createEpisode = orgAction(createEpisodeSchema, {}, async (input, { supabase, org }) => {
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
    })
    .select("id")
    .single();
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
    const { data, error } = await supabase
      .from("episodes")
      .delete()
      .eq("organization_id", org.id)
      .eq("id", input.episodeId)
      .select("id");
    if (error) throw error;
    if (!data.length) return fail("That episode couldn't be deleted.");

    redirect(`/${org.slug}/episodes`);
  },
);
