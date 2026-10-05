-- =============================================================================
-- Phase 10: more files from guests
--   1. organizations.requested_assets: which extra files a workspace asks
--      for (company logo, intro audio, media kit). All optional for guests.
--   2. submission_assets: one row per uploaded file, written only by
--      submit_onboarding() (service role). Hosts read it through RLS.
--   3. guest-assets bucket accepts audio and PDF, up to 50 MB. Per-kind
--      types and sizes are checked against the stored object's metadata,
--      for headshots too, since the bucket-wide limit is now higher.
-- =============================================================================

create type public.asset_kind as enum ('company_logo', 'intro_audio', 'media_kit');

alter table public.organizations
  add column requested_assets public.asset_kind[] not null default '{}';
grant update (requested_assets) on public.organizations to authenticated;

create table public.submission_assets (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  episode_guest_id uuid not null,
  kind             public.asset_kind not null,
  path             text not null check (char_length(path) <= 300),
  file_name        text not null check (char_length(file_name) between 1 and 200),
  content_type     text not null check (char_length(content_type) <= 100),
  size_bytes       bigint not null check (size_bytes >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, episode_guest_id)
    references public.episode_guests (organization_id, id) on delete cascade,
  unique (episode_guest_id, kind),
  check (path like organization_id::text || '/' || episode_guest_id::text || '/%')
);

create index submission_assets_org_idx on public.submission_assets (organization_id);

create trigger submission_assets_set_updated_at before update on public.submission_assets
  for each row execute function public.set_updated_at();

alter table public.submission_assets enable row level security;
create policy "submission_assets: members read" on public.submission_assets
  for select to authenticated using (public.is_org_member(organization_id));
revoke all on public.submission_assets from authenticated;
grant select on public.submission_assets to authenticated;

update storage.buckets
set file_size_limit    = 52428800,  -- 50 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
                               'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
                               'application/pdf']
where id = 'guest-assets';

-- Allowed types and sizes per file kind. Keep in sync with src/schemas/assets.ts.
create function public.guest_file_allowed(p_kind text, p_mimetype text, p_size bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'headshot'     then p_mimetype in ('image/jpeg', 'image/png', 'image/webp') and p_size <= 10485760
    when 'company_logo' then p_mimetype in ('image/jpeg', 'image/png', 'image/webp') and p_size <= 10485760
    when 'intro_audio'  then p_mimetype in ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav')
                             and p_size <= 52428800
    when 'media_kit'    then p_mimetype = 'application/pdf' and p_size <= 26214400
    else false
  end;
$$;

-- Context: what files the workspace asks for, and what the guest already sent.
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
    'episode',           jsonb_build_object('id', e.id, 'title', e.title, 'recording_at', e.recording_at),
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

-- Submit: as before, plus p_payload.assets = { "<kind>": {"path", "file_name"} | null }.
-- A null entry removes that file; kinds left out are kept as they are.
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
  v_headshot text  := nullif(p_payload ->> 'headshot_path', '');
  v_signer   text  := nullif(btrim(p_payload ->> 'release_signed_name'), '');
  v_answers  jsonb := coalesce(p_payload -> 'custom_answers', '{}'::jsonb);
  v_assets   jsonb := coalesce(p_payload -> 'assets', '{}'::jsonb);
  v_prefix   text;
  v_kind     text;
  v_entry    jsonb;
  v_path     text;
  v_object   storage.objects;
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
  if jsonb_typeof(v_answers) <> 'object' or jsonb_typeof(v_assets) <> 'object' then
    raise exception 'custom answers and assets must be objects' using errcode = '22023';
  end if;

  v_prefix := v_booking.organization_id::text || '/' || v_booking.id::text || '/';

  if v_headshot is not null then
    if v_headshot not like v_prefix || '%' then
      raise exception 'invalid headshot path' using errcode = '22023';
    end if;
    select * into v_object from storage.objects where bucket_id = 'guest-assets' and name = v_headshot;
    if not found then
      raise exception 'headshot not uploaded' using errcode = '22023';
    end if;
    if not public.guest_file_allowed('headshot', v_object.metadata ->> 'mimetype',
                                     (v_object.metadata ->> 'size')::bigint) then
      raise exception 'headshot type or size not allowed' using errcode = '22023';
    end if;
  end if;

  select * into v_org from public.organizations where id = v_booking.organization_id;

  insert into public.submissions as s (
    organization_id, episode_guest_id,
    display_name, headline, short_bio, long_bio, pronouns, name_pronunciation,
    website_url, social_links, headshot_path, custom_answers,
    release_signed_name, release_signed_at, release_version, release_text_snapshot,
    release_ip, release_user_agent
  )
  values (
    v_booking.organization_id, v_booking.id,
    p_payload ->> 'display_name', p_payload ->> 'headline',
    p_payload ->> 'short_bio', p_payload ->> 'long_bio',
    p_payload ->> 'pronouns', p_payload ->> 'name_pronunciation',
    p_payload ->> 'website_url', coalesce(p_payload -> 'social_links', '{}'::jsonb),
    v_headshot, v_answers,
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
    custom_answers        = excluded.custom_answers,
    release_signed_name   = excluded.release_signed_name,
    release_signed_at     = excluded.release_signed_at,
    release_version       = excluded.release_version,
    release_text_snapshot = excluded.release_text_snapshot,
    release_ip            = excluded.release_ip,
    release_user_agent    = excluded.release_user_agent;

  for v_kind, v_entry in select key, value from jsonb_each(v_assets) loop
    if v_kind not in ('company_logo', 'intro_audio', 'media_kit') then
      raise exception 'unknown file kind %', v_kind using errcode = '22023';
    end if;

    if jsonb_typeof(v_entry) = 'null' then
      delete from public.submission_assets where episode_guest_id = v_booking.id and kind = v_kind::public.asset_kind;
      continue;
    end if;

    if not (v_kind::public.asset_kind = any (v_org.requested_assets)) then
      raise exception 'file kind % was not requested', v_kind using errcode = '22023';
    end if;
    v_path := v_entry ->> 'path';
    if v_path is null or v_path not like v_prefix || '%' then
      raise exception 'invalid file path' using errcode = '22023';
    end if;
    select * into v_object from storage.objects where bucket_id = 'guest-assets' and name = v_path;
    if not found then
      raise exception 'file not uploaded' using errcode = '22023';
    end if;
    if not public.guest_file_allowed(v_kind, v_object.metadata ->> 'mimetype',
                                     (v_object.metadata ->> 'size')::bigint) then
      raise exception 'file type or size not allowed' using errcode = '22023';
    end if;

    insert into public.submission_assets as a
      (organization_id, episode_guest_id, kind, path, file_name, content_type, size_bytes)
    values (
      v_booking.organization_id, v_booking.id, v_kind::public.asset_kind, v_path,
      left(coalesce(nullif(btrim(v_entry ->> 'file_name'), ''), v_kind), 200),
      v_object.metadata ->> 'mimetype', (v_object.metadata ->> 'size')::bigint
    )
    on conflict (episode_guest_id, kind) do update set
      path         = excluded.path,
      file_name    = excluded.file_name,
      content_type = excluded.content_type,
      size_bytes   = excluded.size_bytes;
  end loop;

  update public.episode_guests
  set status             = 'assets_submitted',
      submitted_at       = now(),
      token_last_used_at = now()
  where id = v_booking.id;
end;
$$;

revoke execute on function public.guest_file_allowed(text, text, bigint) from public, anon, authenticated;
