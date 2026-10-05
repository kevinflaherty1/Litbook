-- =============================================================================
-- Phase 12: recording scheduling
--   1. episodes.meeting_url: where the recording happens (Zoom, Riverside,
--      Google Meet...). Shown to guests and put in calendar invites.
--   2. recording_slots: times a host offers for an episode. Each slot holds
--      at most one guest, and each booking holds at most one slot.
--   3. pick_recording_slot() / release_recording_slot(): the guest portal's
--      only way to take or give up a slot (service role, token-checked).
--   4. get_onboarding_context() carries the meeting link and the slots.
-- =============================================================================

-- 1. Meeting link -------------------------------------------------------------
alter table public.episodes
  add column meeting_url text check (char_length(meeting_url) <= 500 and meeting_url ~* '^https?://');
grant update (meeting_url) on public.episodes to authenticated;

-- 2. Slots ------------------------------------------------------------------------
create table public.recording_slots (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  episode_id       uuid not null,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  episode_guest_id uuid,
  booked_at        timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, episode_id)
    references public.episodes (organization_id, id) on delete cascade,
  -- Removing a booking frees its slot (only the booking column is cleared).
  foreign key (organization_id, episode_guest_id)
    references public.episode_guests (organization_id, id) on delete set null (episode_guest_id),
  unique (episode_id, starts_at),
  check ((episode_guest_id is null) = (booked_at is null))
);

create unique index recording_slots_one_per_booking
  on public.recording_slots (episode_guest_id) where episode_guest_id is not null;
create index recording_slots_episode_idx on public.recording_slots (episode_id, starts_at);
create index recording_slots_org_idx on public.recording_slots (organization_id);

create trigger recording_slots_set_created_by before insert on public.recording_slots
  for each row execute function public.set_created_by();
create trigger recording_slots_set_updated_at before update on public.recording_slots
  for each row execute function public.set_updated_at();
create trigger recording_slots_lock_org before update on public.recording_slots
  for each row execute function public.prevent_organization_id_change();

alter table public.recording_slots enable row level security;
create policy "recording_slots: members read" on public.recording_slots
  for select to authenticated using (public.is_org_member(organization_id));
create policy "recording_slots: members insert" on public.recording_slots
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy "recording_slots: members update" on public.recording_slots
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy "recording_slots: members delete" on public.recording_slots
  for delete to authenticated using (public.is_org_member(organization_id));

-- Hosts offer, move and remove slots, and can free one; only the guest portal assigns them.
revoke all on public.recording_slots from authenticated;
grant select, delete on public.recording_slots to authenticated;
grant insert (organization_id, episode_id, starts_at, duration_minutes) on public.recording_slots to authenticated;
grant update (starts_at, duration_minutes, episode_guest_id) on public.recording_slots to authenticated;

-- Hosts may free a slot (set episode_guest_id to NULL) but never assign one.
-- Direct API writes run as "authenticated"; the portal RPCs run as their
-- (SECURITY DEFINER) owner, so they pass.
create function public.guard_recording_slot_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.episode_guest_id is distinct from old.episode_guest_id
     and new.episode_guest_id is not null then
    raise exception 'slots are assigned by the guest' using errcode = '42501';
  end if;
  if new.episode_guest_id is null then
    new.booked_at = null;
  end if;
  return new;
end;
$$;

create trigger recording_slots_guard_assignment
  before update on public.recording_slots
  for each row execute function public.guard_recording_slot_assignment();

-- 3. Portal RPCs ----------------------------------------------------------------
-- Resolves a token to its booking (locked for update), or raises like submit_onboarding().
create function public.booking_for_token(p_token text)
returns public.episode_guests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.episode_guests;
begin
  select * into v_booking
  from public.episode_guests
  where p_token is not null
    and char_length(p_token) between 32 and 128
    and token_hash = public.hash_token(p_token)
    and token_expires_at > now()
  for update;
  if not found or v_booking.status = 'cancelled' then
    raise exception 'link is invalid or expired' using errcode = 'P0002';
  end if;
  return v_booking;
end;
$$;

-- Takes a slot for the guest, giving up any slot they held before. The slot
-- must be on their episode, in the future, and free (or already theirs).
create function public.pick_recording_slot(p_token text, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.episode_guests := public.booking_for_token(p_token);
  v_slot    public.recording_slots;
begin
  select * into v_slot
  from public.recording_slots
  where id = p_slot_id and episode_id = v_booking.episode_id
  for update;

  if not found or v_slot.starts_at <= now() then
    raise exception 'that time is no longer available' using errcode = 'P0002';
  end if;
  if v_slot.episode_guest_id is not null and v_slot.episode_guest_id <> v_booking.id then
    raise exception 'that time was just taken' using errcode = '23505';
  end if;

  update public.recording_slots
  set episode_guest_id = null
  where episode_guest_id = v_booking.id and id <> v_slot.id;

  update public.recording_slots
  set episode_guest_id = v_booking.id,
      booked_at        = coalesce(case when episode_guest_id = v_booking.id then booked_at end, now())
  where id = v_slot.id
  returning * into v_slot;

  update public.episode_guests set token_last_used_at = now() where id = v_booking.id;

  return jsonb_build_object('id', v_slot.id, 'starts_at', v_slot.starts_at,
                            'duration_minutes', v_slot.duration_minutes);
end;
$$;

create function public.release_recording_slot(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.episode_guests := public.booking_for_token(p_token);
begin
  update public.recording_slots set episode_guest_id = null where episode_guest_id = v_booking.id;
end;
$$;

-- 4. Context ----------------------------------------------------------------------
create or replace function public.get_onboarding_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'episode_guest_id',  eg.id,
    'organization_id',   eg.organization_id,
    'status',            eg.status,
    'is_locked',         eg.status = 'ready',
    'created_by',        eg.created_by,
    'organization',      jsonb_build_object(
                           'name',             o.name,
                           'slug',             o.slug,
                           'logo_path',        o.logo_path,
                           'brand_color',      o.brand_color,
                           'portal_welcome',   o.portal_welcome,
                           'requested_assets', to_jsonb(o.requested_assets)),
    'episode',           jsonb_build_object('id', e.id, 'title', e.title, 'recording_at', e.recording_at,
                                            'meeting_url', e.meeting_url),
    'guest',             jsonb_build_object('full_name', g.full_name, 'email', g.email),
    'release',           jsonb_build_object('text', o.release_form_text, 'version', o.release_form_version),
    'custom_fields',     coalesce((
                           select jsonb_agg(jsonb_build_object(
                                    'id',         f.id,
                                    'label',      f.label,
                                    'help_text',  f.help_text,
                                    'field_type', f.field_type,
                                    'options',    to_jsonb(f.options),
                                    'required',   f.required)
                                  order by f.position, f.created_at)
                           from public.custom_fields f
                           where f.organization_id = eg.organization_id and f.archived_at is null
                         ), '[]'::jsonb),
    'assets',            coalesce((
                           select jsonb_agg(jsonb_build_object(
                                    'kind',       a.kind,
                                    'path',       a.path,
                                    'file_name',  a.file_name,
                                    'size_bytes', a.size_bytes)
                                  order by a.kind)
                           from public.submission_assets a
                           where a.episode_guest_id = eg.id
                         ), '[]'::jsonb),
    -- Open future slots plus the guest's own (even if it has passed).
    'slots',             coalesce((
                           select jsonb_agg(jsonb_build_object(
                                    'id',               rs.id,
                                    'starts_at',        rs.starts_at,
                                    'duration_minutes', rs.duration_minutes,
                                    'mine',             coalesce(rs.episode_guest_id = eg.id, false))
                                  order by rs.starts_at)
                           from public.recording_slots rs
                           where rs.episode_id = eg.episode_id
                             and (rs.episode_guest_id = eg.id
                                  or (rs.episode_guest_id is null and rs.starts_at > now()))
                         ), '[]'::jsonb),
    'submission',        case when s.id is null then null else jsonb_build_object(
                           'display_name',        s.display_name,
                           'headline',            s.headline,
                           'short_bio',           s.short_bio,
                           'long_bio',            s.long_bio,
                           'pronouns',            s.pronouns,
                           'name_pronunciation',  s.name_pronunciation,
                           'website_url',         s.website_url,
                           'social_links',        s.social_links,
                           'headshot_path',       s.headshot_path,
                           'custom_answers',      s.custom_answers,
                           'release_signed_name', s.release_signed_name,
                           'release_signed_at',   s.release_signed_at
                         ) end
  )
  from public.episode_guests eg
  join public.episodes e      on e.id = eg.episode_id
  join public.guests g        on g.id = eg.guest_id
  join public.organizations o on o.id = eg.organization_id
  left join public.submissions s on s.episode_guest_id = eg.id
  where p_token is not null
    and char_length(p_token) between 32 and 128
    and eg.token_hash = public.hash_token(p_token)
    and eg.token_expires_at > now()
    and eg.status <> 'cancelled';
$$;

revoke execute on function
  public.guard_recording_slot_assignment(),
  public.booking_for_token(text),
  public.pick_recording_slot(text, uuid),
  public.release_recording_slot(text)
from public, anon, authenticated;
grant execute on function
  public.pick_recording_slot(text, uuid),
  public.release_recording_slot(text)
to service_role;
