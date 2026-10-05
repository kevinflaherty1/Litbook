import "server-only";

import { answeredQuestions, listCustomFields } from "@/features/custom-fields/queries";
import { buildReleasePdf } from "@/features/bookings/release-pdf";
import { fileSlug } from "@/lib/show-notes";
import { listStoragePrefix, type Bucket } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { fetchAll, json, type AddToZip } from "@/lib/zip-stream";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type Org = { id: string; name: string; slug: string };

// Explicit column lists: token hashes and other secrets never leave the database.
const EPISODE_COLUMNS =
  "id, title, description, episode_number, status, recording_at, publish_at, meeting_url, created_by, created_at, updated_at";
const GUEST_COLUMNS = "id, full_name, email, internal_notes, created_by, created_at, updated_at";
const BOOKING_COLUMNS = `id, episode_id, guest_id, status, token_expires_at, token_last_used_at, submitted_at,
  ready_at, link_emailed_at, last_reminder_at, reminder_count, created_by, created_at, updated_at`;
const SUBMISSION_COLUMNS = `id, episode_guest_id, display_name, headline, short_bio, long_bio, pronouns,
  name_pronunciation, website_url, social_links, headshot_path, custom_answers, release_signed_name,
  release_signed_at, release_version, release_text_snapshot, release_ip, release_user_agent, created_at, updated_at`;

const README = (what: string) =>
  `Litbook data export: ${what}
Generated ${new Date().toISOString()}

JSON files hold the database records. Times are UTC (ISO 8601).
files/ holds every uploaded file, at the same path it has in storage.
`;

async function addFiles(add: AddToZip, bucket: Bucket, prefix: string, into = `files/${bucket}`) {
  const storage = createAdminClient().storage.from(bucket);
  for (const path of await listStoragePrefix(prefix, bucket)) {
    const { data, error } = await storage.download(path);
    if (error) {
      console.error("[export] could not download", bucket, path, error);
      continue;
    }
    add(`${into}/${path}`, new Uint8Array(await data.arrayBuffer()));
  }
}

/**
 * Everything a workspace holds: records as JSON plus every file. Callers must
 * have checked the user is an owner or admin; reads go through RLS.
 */
export async function buildWorkspaceExport(supabase: ServerClient, org: Org, add: AddToZip) {
  const orgId = org.id;
  const [organization, members, invitations, episodes, guests, bookings, submissions, customFields, slots] =
    await Promise.all([
      supabase
        .from("organizations")
        .select(
          `id, name, slug, logo_path, brand_color, portal_welcome, release_form_text, release_form_version,
           guest_reminders_enabled, subscription_status, current_period_end, cancel_at_period_end, created_at, updated_at`,
        )
        .eq("id", orgId)
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data;
        }),
      fetchAll((from, to) =>
        supabase
          .from("organization_members")
          .select("user_id, role, created_at, profiles(email, full_name)")
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("organization_invitations")
          .select("id, email, role, invited_by, expires_at, accepted_at, created_at")
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("episodes")
          .select(EPISODE_COLUMNS)
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("guests")
          .select(GUEST_COLUMNS)
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("episode_guests")
          .select(BOOKING_COLUMNS)
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("submissions")
          .select(SUBMISSION_COLUMNS)
          .eq("organization_id", orgId)
          .order("created_at")
          .range(from, to),
      ),
      listCustomFields(orgId),
      fetchAll((from, to) =>
        supabase
          .from("recording_slots")
          .select(
            "id, episode_id, starts_at, duration_minutes, episode_guest_id, booked_at, created_by, created_at",
          )
          .eq("organization_id", orgId)
          .order("starts_at")
          .range(from, to),
      ),
    ]);

  add("README.txt", README(`workspace "${org.name}" (${org.slug})`));
  add("organization.json", json(organization));
  add(
    "members.json",
    json(
      members.map(({ profiles, ...m }) => ({ ...m, email: profiles?.email, full_name: profiles?.full_name })),
    ),
  );
  add("invitations.json", json(invitations));
  add("episodes.json", json(episodes));
  add("guests.json", json(guests));
  add("bookings.json", json(bookings));
  add("submissions.json", json(submissions));
  add("custom_fields.json", json(customFields));
  add("recording_slots.json", json(slots));
  await addFiles(add, "guest-assets", `${orgId}/`);
  await addFiles(add, "org-branding", `${orgId}/`);
}

/**
 * Everything the workspace holds about one guest (a data subject access
 * request): their record, bookings, submissions, signed releases as PDFs,
 * and their files. Returns false when the guest isn't in this workspace.
 */
export async function buildGuestExport(supabase: ServerClient, org: Org, guestId: string, add: AddToZip) {
  const { data: guest, error } = await supabase
    .from("guests")
    .select(GUEST_COLUMNS)
    .eq("organization_id", org.id)
    .eq("id", guestId)
    .maybeSingle();
  if (error) throw error;
  if (!guest) return false;

  const [{ data: bookings, error: bookingsError }, customFields] = await Promise.all([
    supabase
      .from("episode_guests")
      .select(`${BOOKING_COLUMNS}, episodes!inner(title), submissions(${SUBMISSION_COLUMNS})`)
      .eq("organization_id", org.id)
      .eq("guest_id", guestId)
      .order("created_at"),
    listCustomFields(org.id),
  ]);
  if (bookingsError) throw bookingsError;

  const records = bookings.map(({ episodes, submissions, ...booking }) => {
    const submission = submissions[0] ?? null;
    return {
      ...booking,
      episode_title: episodes.title,
      submission: submission && {
        ...submission,
        answers: answeredQuestions(customFields, submission.custom_answers)
          .filter((a) => a.answer)
          .map(({ label, answer }) => ({ question: label, answer })),
      },
    };
  });

  add("README.txt", README(`guest "${guest.full_name}" in workspace "${org.name}"`));
  add("guest.json", json({ guest, bookings: records }));

  for (const booking of records) {
    const s = booking.submission;
    if (s?.release_signed_at && s.release_signed_name) {
      const pdf = await buildReleasePdf({
        organization: org.name,
        episode: booking.episode_title,
        guestName: s.display_name || guest.full_name,
        guestEmail: guest.email,
        signedName: s.release_signed_name,
        signedAt: s.release_signed_at,
        version: s.release_version,
        text: s.release_text_snapshot ?? "",
        ip: s.release_ip as string | null,
        userAgent: s.release_user_agent,
      });
      add(`releases/${fileSlug(booking.episode_title)}-${booking.id.slice(0, 8)}.pdf`, new Uint8Array(pdf));
    }
    await addFiles(add, "guest-assets", `${org.id}/${booking.id}/`, "files");
  }
  return true;
}

/** The signed-in user's own account data (not workspace content). */
export async function buildAccountExport(supabase: ServerClient, userId: string) {
  const [{ data: profile, error }, { data: memberships, error: membershipsError }, auth] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .single(),
    supabase
      .from("organization_members")
      .select("role, created_at, organizations!inner(id, name, slug)")
      .eq("user_id", userId)
      .order("created_at"),
    createAdminClient().auth.admin.getUserById(userId),
  ]);
  if (error) throw error;
  if (membershipsError) throw membershipsError;
  if (auth.error) throw auth.error;

  const u = auth.data.user;
  return {
    exported_at: new Date().toISOString(),
    account: {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      sign_in_methods: u.identities?.map((i) => i.provider) ?? [],
    },
    profile,
    workspaces: memberships.map((m) => ({
      id: m.organizations.id,
      name: m.organizations.name,
      slug: m.organizations.slug,
      role: m.role,
      joined_at: m.created_at,
    })),
    note: "Episodes, guests and submissions belong to each workspace. Owners and admins can export them in Settings → Data and privacy.",
  };
}
