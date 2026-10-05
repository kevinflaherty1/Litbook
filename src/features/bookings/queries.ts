import "server-only";

import { cache } from "react";

import type { GuestAssets } from "@/lib/show-notes";
import { createClient } from "@/lib/supabase/server";

const SUBMISSION_COLUMNS = `id, display_name, headline, short_bio, long_bio, pronouns, name_pronunciation,
  website_url, social_links, headshot_path, custom_answers, release_signed_name, release_signed_at, release_version,
  release_text_snapshot, release_ip, release_user_agent, updated_at` as const;

/** A booking with its guest, episode, and submission. Null when not in this org. */
export const getBooking = cache(async (orgId: string, bookingId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episode_guests")
    .select(
      `id, status, token_expires_at, submitted_at, ready_at, created_at,
       guests!inner(id, full_name, email),
       episodes!inner(id, title, episode_number, recording_at),
       submissions(${SUBMISSION_COLUMNS})`,
    )
    .eq("organization_id", orgId)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // PostgREST returns the 1:1 submission as a list (its FK is composite).
  const { submissions, ...booking } = data;
  return { ...booking, submission: submissions[0] ?? null };
});

/** Extra files a guest uploaded for a booking (RLS-scoped). */
export async function getBookingAssets(orgId: string, bookingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submission_assets")
    .select("kind, path, file_name, content_type, size_bytes, updated_at")
    .eq("organization_id", orgId)
    .eq("episode_guest_id", bookingId)
    .order("kind");
  if (error) throw error;
  return data;
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBooking>>>;
export type Submission = NonNullable<BookingDetail["submission"]>;

export function toGuestAssets(guestName: string, s: Submission): GuestAssets {
  return {
    name: s.display_name || guestName,
    headline: s.headline,
    pronouns: s.pronouns,
    shortBio: s.short_bio,
    longBio: s.long_bio,
    websiteUrl: s.website_url,
    socialLinks: (s.social_links ?? {}) as Record<string, string>,
  };
}

/** Submitted (or ready) guests on an episode, for show notes and the export. */
export async function getEpisodeSubmissions(orgId: string, episodeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("episode_guests")
    .select(
      `id, status, created_at, guests!inner(full_name), submissions!inner(${SUBMISSION_COLUMNS}),
       submission_assets(kind, path, file_name)`,
    )
    .eq("organization_id", orgId)
    .eq("episode_id", episodeId)
    .in("status", ["assets_submitted", "ready"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.flatMap((b) => {
    const submission = b.submissions[0];
    if (!submission) return [];
    return [
      {
        bookingId: b.id,
        headshotPath: submission.headshot_path,
        customAnswers: submission.custom_answers,
        files: b.submission_assets,
        assets: toGuestAssets(b.guests.full_name, submission),
      },
    ];
  });
}

/** A short-lived URL to show a guest file to a teammate (RLS-checked by Storage). */
export async function getGuestFileUrl(
  path: string | null,
  options?: { download?: string; expiresIn?: number },
) {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("guest-assets")
    .createSignedUrl(
      path,
      options?.expiresIn ?? 600,
      options?.download ? { download: options.download } : undefined,
    );
  if (error) {
    console.error("[vault] could not sign file URL", error);
    return null;
  }
  return data.signedUrl;
}
