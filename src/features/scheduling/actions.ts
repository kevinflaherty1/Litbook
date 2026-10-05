"use server";

import { refresh } from "next/cache";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { orgAction } from "@/lib/safe-action";
import { addSlotsSchema, slotIdSchema } from "@/schemas/scheduling";

/** Offers one or more recording times on an episode. Times already offered are skipped. */
export const addRecordingSlots = orgAction(addSlotsSchema, {}, async (input, { supabase, org }) => {
  const now = Date.now();
  if (input.startsAt.some((t) => new Date(t).getTime() <= now)) {
    return fail("Recording times must be in the future.", { startsAt: ["Pick a time in the future."] });
  }

  const { data: episode, error: episodeError } = await supabase
    .from("episodes")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", input.episodeId)
    .maybeSingle();
  if (episodeError) throw episodeError;
  if (!episode) return fail("That episode no longer exists.");

  const unique = [...new Set(input.startsAt.map((t) => new Date(t).toISOString()))];
  const { error } = await supabase.from("recording_slots").upsert(
    unique.map((startsAt) => ({
      organization_id: org.id,
      episode_id: input.episodeId,
      starts_at: startsAt,
      duration_minutes: input.durationMinutes,
    })),
    { onConflict: "episode_id,starts_at", ignoreDuplicates: true },
  );
  if (error) throw error;
  refresh();
  return ok({ added: unique.length });
});

/** Removes an offered time. A guest who picked it will need to pick again. */
export const deleteRecordingSlot = orgAction(slotIdSchema, {}, async (input, { supabase, org }) => {
  const { error } = await supabase
    .from("recording_slots")
    .delete()
    .eq("organization_id", org.id)
    .eq("id", input.slotId);
  if (error) throw error;
  refresh();
  return ok(undefined);
});

/** Frees a picked time so other guests can take it. */
export const freeRecordingSlot = orgAction(slotIdSchema, {}, async (input, { supabase, org }) => {
  const { error } = await supabase
    .from("recording_slots")
    .update({ episode_guest_id: null })
    .eq("organization_id", org.id)
    .eq("id", input.slotId);
  if (isPgError(error, PG.insufficientPrivilege)) return fail("You can't change that time.");
  if (error) throw error;
  refresh();
  return ok(undefined);
});
