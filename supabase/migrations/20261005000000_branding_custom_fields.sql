-- =============================================================================
-- Phase 8: guest page branding and custom questions
--   1. organizations: logo (public org-branding bucket), brand colour and a
--      welcome message for the guest page. logo_url was never used; logos now
--      live in Storage and are referenced by path.
--   2. custom_fields: extra questions each workspace asks its guests.
--      Archived rather than deleted, so past answers keep their label.
--   3. submissions.custom_answers: { "<field id>": "text" | true | false }.
--      Answers are validated against the field definitions by the server.
--   4. get_onboarding_context() / submit_onboarding() carry the new data.
-- =============================================================================

-- 1. Branding ------------------------------------------------------------------
alter table public.organizations
  drop column logo_url,
  add column logo_path      text check (char_length(logo_path) <= 300),
  add column brand_color    text check (brand_color ~ '^#[0-9a-f]{6}$'),
  add column portal_welcome text check (char_length(portal_welcome) <= 1000),
  -- A logo must live under the org's own prefix in the bucket.
  add constraint organizations_logo_path_prefix
    check (logo_path is null or logo_path like id::text || '/%');

grant update (logo_path, brand_color, portal_welcome) on public.organizations to authenticated;

-- Logos are shown on the public guest page and in emails, so the bucket is
-- public (read by URL). Only owners and admins of the org can write to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', true, 2097152,  -- 2 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "org-branding: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'org-branding'
         and public.is_org_member(public.storage_object_org_id(name)));

create policy "org-branding: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-branding'
              and public.has_org_role(public.storage_object_org_id(name), '{owner,admin}'));

create policy "org-branding: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'org-branding'
         and public.has_org_role(public.storage_object_org_id(name), '{owner,admin}'))
  with check (bucket_id = 'org-branding'
              and public.has_org_role(public.storage_object_org_id(name), '{owner,admin}'));

create policy "org-branding: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'org-branding'
         and public.has_org_role(public.storage_object_org_id(name), '{owner,admin}'));

-- 2. Custom questions ---------------------------------------------------------------
create type public.custom_field_type as enum ('short_text', 'long_text', 'url', 'select', 'checkbox');

create table public.custom_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label           text not null check (char_length(label) between 1 and 200),
  help_text       text check (char_length(help_text) <= 500),
  field_type      public.custom_field_type not null default 'short_text',
  options         text[] not null default '{}'
                  check (cardinality(options) <= 30 and pg_column_size(options) <= 8192),
  required        boolean not null default false,
  position        integer not null default 0,
  archived_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  check (field_type <> 'select' or cardinality(options) >= 1)
);

create index custom_fields_org_position_idx on public.custom_fields (organization_id, position);

create trigger custom_fields_set_created_by before insert on public.custom_fields
  for each row execute function public.set_created_by();
create trigger custom_fields_set_updated_at before update on public.custom_fields
  for each row execute function public.set_updated_at();
create trigger custom_fields_lock_org before update on public.custom_fields
  for each row execute function public.prevent_organization_id_change();

alter table public.custom_fields enable row level security;

create policy "custom_fields: members read" on public.custom_fields
  for select to authenticated using (public.is_org_member(organization_id));
create policy "custom_fields: admins insert" on public.custom_fields
  for insert to authenticated with check (public.has_org_role(organization_id, '{owner,admin}'));
create policy "custom_fields: admins update" on public.custom_fields
  for update to authenticated
  using (public.has_org_role(organization_id, '{owner,admin}'))
  with check (public.has_org_role(organization_id, '{owner,admin}'));

-- The type is fixed once created (answers depend on it); fields are archived, not deleted.
revoke all on public.custom_fields from authenticated;
grant select on public.custom_fields to authenticated;
grant insert (organization_id, label, help_text, field_type, options, required, position)
  on public.custom_fields to authenticated;
grant update (label, help_text, options, required, position, archived_at)
  on public.custom_fields to authenticated;

-- 3. Answers --------------------------------------------------------------------------
alter table public.submissions
  add column custom_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(custom_answers) = 'object' and pg_column_size(custom_answers) <= 65536);

-- 4. Portal RPCs ----------------------------------------------------------------------
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
                           'name',           o.name,
                           'slug',           o.slug,
                           'logo_path',      o.logo_path,
                           'brand_color',    o.brand_color,
                           'portal_welcome', o.portal_welcome),
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
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'custom answers must be an object' using errcode = '22023';
  end if;
  if v_headshot is not null then
    if v_headshot not like v_booking.organization_id::text || '/' || v_booking.id::text || '/%' then
      raise exception 'invalid headshot path' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'guest-assets' and name = v_headshot) then
      raise exception 'headshot not uploaded' using errcode = '22023';
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

  update public.episode_guests
  set status             = 'assets_submitted',
      submitted_at       = now(),
      token_last_used_at = now()
  where id = v_booking.id;
end;
$$;
