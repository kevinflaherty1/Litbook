import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isRangeError, PAGE_SIZE, pageRange } from "@/lib/pagination";
import type { EpisodeStatus } from "@/schemas/episode";
import type { OnboardingStatus } from "@/schemas/booking";

// token_hash is never selected: the app only needs to know whether a link exists.
const BOOKING_COLUMNS =
  "id, status, token_expires_at, token_last_used_at, submitted_at, ready_at, created_at" as const;

/** Episodes, unscheduled first, then by recording date (newest first). */
export async function listEpisodes(orgId: string, filter: { status?: EpisodeStatus; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("episodes")
    .select("id, title, episode_number, status, recording_at, publish_at, episode_guests(status)", {
      count: "exact",
    })
    .eq("organization_id", orgId);
  if (filter.status) query = query.eq("status", filter.status);

  const { data, count, error } = await query
    .order("recording_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(...pageRange(filter.page));

  if (isRangeError(error)) return { episodes: [], total: count ?? 0, pageSize: PAGE_SIZE };
  if (error) throw error;
  return { episodes: data, total: count ?? 0, pageSize: PAGE_SIZE };
}

/** One episode with its bookings. Returns null when it doesn't exist in this org. */
export const getEpisode = cache(async (orgId: string, episodeId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episodes")
    .select(
      `id, title, description, episode_number, status, recording_at, publish_at, created_at,
       episode_guests(${BOOKING_COLUMNS}, guests!inner(id, full_name, email))`,
    )
    .eq("organization_id", orgId)
    .eq("id", episodeId)
    .order("created_at", { referencedTable: "episode_guests", ascending: true })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  // Computed once on the server so server and client render the same thing.
  const now = Date.now();
  return {
    ...data,
    episode_guests: data.episode_guests.map((b) => ({
      ...b,
      linkExpired: !!b.token_expires_at && new Date(b.token_expires_at).getTime() < now,
    })),
  };
});

export type EpisodeDetail = NonNullable<Awaited<ReturnType<typeof getEpisode>>>;
export type Booking = EpisodeDetail["episode_guests"][number];

/** Next recordings that haven't happened yet. */
export async function getUpcomingRecordings(orgId: string, limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episodes")
    .select(
      "id, title, episode_number, status, recording_at, episode_guests(status, guests!inner(full_name))",
    )
    .eq("organization_id", orgId)
    .in("status", ["draft", "scheduled"])
    .gte("recording_at", new Date().toISOString())
    .order("recording_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

/** Booking counts per onboarding status, plus bookings that have no link yet. */
export async function getBookingCounts(orgId: string) {
  const supabase = await createClient();
  const count = (status: OnboardingStatus, noLink = false) => {
    let query = supabase
      .from("episode_guests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", status);
    if (noLink) query = query.is("token_expires_at", null);
    return query;
  };

  const results = await Promise.all([
    count("pending"),
    count("assets_submitted"),
    count("ready"),
    count("pending", true),
  ]);
  for (const r of results) if (r.error) throw r.error;
  const [pending, submitted, ready, noLink] = results.map((r) => r.count ?? 0);
  return { pending, submitted, ready, noLink };
}

export async function getEpisodeCount(orgId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw error;
  return count ?? 0;
}
