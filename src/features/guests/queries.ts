import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { isRangeError, PAGE_SIZE, pageRange } from "@/lib/pagination";

/** Strips characters that have meaning in PostgREST filters and LIKE patterns. */
function toSearchTerm(q: string) {
  return q.replace(/[%_*,().\\:"]/g, " ").trim();
}

/** The guest directory, alphabetical, optionally filtered by name or email. */
export async function listGuests(orgId: string, filter: { q: string; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("guests")
    .select("id, full_name, email, created_at, episode_guests(count)", { count: "exact" })
    .eq("organization_id", orgId);

  const term = toSearchTerm(filter.q);
  if (term) query = query.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`);

  const { data, count, error } = await query
    .order("full_name", { ascending: true })
    .order("id", { ascending: true })
    .range(...pageRange(filter.page));

  if (isRangeError(error)) return { guests: [], total: count ?? 0, pageSize: PAGE_SIZE };
  if (error) throw error;
  return {
    guests: data.map(({ episode_guests, ...g }) => ({ ...g, bookingCount: episode_guests[0]?.count ?? 0 })),
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

/** One guest with the episodes they're booked on. Null when not in this org. */
export const getGuest = cache(async (orgId: string, guestId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .select(
      `id, full_name, email, internal_notes, created_at,
       episode_guests(id, status, token_expires_at, created_at,
                      episodes!inner(id, title, episode_number, recording_at, status))`,
    )
    .eq("organization_id", orgId)
    .eq("id", guestId)
    .order("created_at", { referencedTable: "episode_guests", ascending: false })
    .maybeSingle();

  if (error) throw error;
  return data;
});

/** Guests for the "book from directory" picker. */
export async function getGuestOptions(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .select("id, full_name, email")
    .eq("organization_id", orgId)
    .order("full_name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return data;
}

export async function getGuestCount(orgId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("guests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw error;
  return count ?? 0;
}
