-- =============================================================================
-- Phase 3: guest onboarding portal
--   1. Rate limiting for the public portal (fixed window, service_role only).
--   2. record_onboarding_visit(): marks a link as opened.
--   3. get_onboarding_context(): also returns what the portal needs to notify
--      the host (org slug, episode id).
--   4. submit_onboarding(): the headshot must actually exist in storage.
-- =============================================================================

-- 1. Rate limiting --------------------------------------------------------------
create table public.rate_limits (
  key          text        not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits         integer     not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- no policies: service_role only
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for p_key and returns true while the caller is within
-- p_limit hits per p_window_seconds.
create function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits   integer;
begin
  insert into public.rate_limits as r (key, window_start)
  values (p_key, v_window)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Occasionally clear out old windows so the table stays small.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- 2. Visits -------------------------------------------------------------------------
create function public.record_onboarding_visit(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.episode_guests
  set token_last_used_at = now()
  where p_token is not null
    and char_length(p_token) between 32 and 128
    and token_hash = public.hash_token(p_token)
    and token_expires_at > now()
    and status <> 'cancelled';
$$;

-- 3. Context ----------------------------------------------------------------------
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
    'organization',      jsonb_build_object('name', o.name, 'slug', o.slug, 'logo_url', o.logo_url),
    'episode',           jsonb_build_object('id', e.id, 'title', e.title, 'recording_at', e.recording_at),
    'guest',             jsonb_build_object('full_name', g.full_name, 'email', g.email),
    'release',           jsonb_build_object('text', o.release_form_text, 'version', o.release_form_version),
    'submission',        case when s.id is null then null else jsonb_build_object(
                           'display_name',       s.display_name,
                           'headline',           s.headline,
                           'short_bio',          s.short_bio,
                           'long_bio',           s.long_bio,
                           'pronouns',           s.pronouns,
                           'name_pronunciation', s.name_pronunciation,
                           'website_url',        s.website_url,
                           'social_links',       s.social_links,
                           'headshot_path',      s.headshot_path,
                           'release_signed_name', s.release_signed_name,
                           'release_signed_at',  s.release_signed_at
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

-- 4. Submit: same as before, plus the headshot must exist in the bucket. -------------
create or replace function public.submit_onboarding(
  p_token      text,
  p_payload    jsonb,
  p_ip         inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking  public.episode_guests;
  v_org      public.organizations;
  v_headshot text := nullif(p_payload ->> 'headshot_path', '');
  v_signer   text := nullif(btrim(p_payload ->> 'release_signed_name'), '');
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
  if v_booking.status = 'ready' then
    raise exception 'submission is locked' using errcode = '55000';
  end if;
  if coalesce((p_payload ->> 'release_accepted')::boolean, false) is not true or v_signer is null then
    raise exception 'release must be accepted and signed' using errcode = '22023';
  end if;
  if v_headshot is not null then
    -- Must live under this booking's prefix (as issued by the upload action)...
    if v_headshot not like v_booking.organization_id::text || '/' || v_booking.id::text || '/%' then
      raise exception 'invalid headshot path' using errcode = '22023';
    end if;
    -- ...and must have actually been uploaded.
    if not exists (select 1 from storage.objects where bucket_id = 'guest-assets' and name = v_headshot) then
      raise exception 'headshot not uploaded' using errcode = '22023';
    end if;
  end if;

  select * into v_org from public.organizations where id = v_booking.organization_id;

  insert into public.submissions as s (
    organization_id, episode_guest_id,
    display_name, headline, short_bio, long_bio, pronouns, name_pronunciation,
    website_url, social_links, headshot_path,
    release_signed_name, release_signed_at, release_version, release_text_snapshot,
    release_ip, release_user_agent
  )
  values (
    v_booking.organization_id, v_booking.id,
    p_payload ->> 'display_name', p_payload ->> 'headline',
    p_payload ->> 'short_bio', p_payload ->> 'long_bio',
    p_payload ->> 'pronouns', p_payload ->> 'name_pronunciation',
    p_payload ->> 'website_url', coalesce(p_payload -> 'social_links', '{}'::jsonb),
    v_headshot,
    v_signer, now(), v_org.release_form_version, v_org.release_form_text,
    p_ip, left(p_user_agent, 1000)
  )
  on conflict (episode_guest_id) do update set
    display_name          = excluded.display_name,
    headline              = excluded.headline,
    short_bio             = excluded.short_bio,
    long_bio              = excluded.long_bio,
    pronouns              = excluded.pronouns,
    name_pronunciation    = excluded.name_pronunciation,
    website_url           = excluded.website_url,
    social_links          = excluded.social_links,
    headshot_path         = coalesce(excluded.headshot_path, s.headshot_path),
    release_signed_name   = excluded.release_signed_name,
    release_signed_at     = excluded.release_signed_at,
    release_version       = excluded.release_version,
    release_text_snapshot = excluded.release_text_snapshot,
    release_ip            = excluded.release_ip,
    release_user_agent    = excluded.release_user_agent;

  update public.episode_guests
  set status             = 'assets_submitted',
      submitted_at       = now(),
      token_last_used_at = now()
  where id = v_booking.id;
end;
$$;

-- Privileges: the portal functions are server-only (service_role).
revoke execute on function
  public.check_rate_limit(text, integer, integer),
  public.record_onboarding_visit(text)
from public, anon, authenticated;
grant execute on function
  public.check_rate_limit(text, integer, integer),
  public.record_onboarding_visit(text)
to service_role;
