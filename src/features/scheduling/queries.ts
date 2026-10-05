import "server-only";

import { createClient } from "@/lib/supabase/server";

/** An episode's offered recording times, with who picked each. */
export async function listEpisodeSlots(orgId: string, episodeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recording_slots")
    .select("id, starts_at, duration_minutes, booked_at, episode_guests(id, guests!inner(full_name))")
    .eq("organization_id", orgId)
    .eq("episode_id", episodeId)
    .order("starts_at");
  if (error) throw error;
  return data.map(({ episode_guests, ...slot }) => ({
    ...slot,
    bookingId: episode_guests?.id ?? null,
    guestName: episode_guests?.guests.full_name ?? null,
  }));
}

export type EpisodeSlot = Awaited<ReturnType<typeof listEpisodeSlots>>[number];
