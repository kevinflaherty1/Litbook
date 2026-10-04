-- =============================================================================
-- Litbook — initial schema
--
-- Multi-tenant guest booking & onboarding portal for podcasters.
-- Tenancy boundary: organization_id. Every tenant-owned row carries it, and
-- RLS policies check it through the SECURITY DEFINER helpers in section 4.
--
-- Access model
--   anon           → no table access at all. The public guest portal never talks
--                    to Postgres directly; Next.js server actions validate input
--                    with Zod and call the portal RPCs (section 7) with the
--                    service-role client.
--   authenticated  → RLS-scoped access to rows of organizations they belong to.
--                    Sensitive columns (billing, signed release evidence) are
--                    write-protected with column-level privileges.
--   service_role   → Stripe webhooks, portal RPCs, signed upload URLs.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------

create type public.org_role as enum ('owner', 'admin', 'member');

-- Mirrors Stripe's Subscription.status. NULL on organizations = never subscribed.
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid',
  'incomplete', 'incomplete_expired', 'paused'
);

create type public.episode_status as enum (
  'draft', 'scheduled', 'recorded', 'published', 'archived'
);

create type public.onboarding_status as enum (
  'pending',           -- link issued, guest hasn't submitted
  'assets_submitted',  -- guest submitted; host reviewing
  'ready',             -- host approved; guest edits locked
  'cancelled'          -- booking cancelled; link disabled
);

-- -----------------------------------------------------------------------------
-- 2. Generic trigger functions
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- A row never moves between tenants.
create function public.prevent_organization_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------

-- 3.1 profiles — 1:1 with auth.users, created by trigger on sign-up.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text check (char_length(full_name) <= 120),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 3.2 organizations — the tenant. Holds Stripe billing state.
create table public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 1 and 120),
  slug                   text not null unique
                         check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  logo_url               text,
  release_form_text      text not null default
    'I grant the producers of this podcast, and their assigns, the irrevocable right '
    'to record, edit, publish, distribute, and promote my name, likeness, voice, '
    'biography, and appearance in connection with this episode, in any media now '
    'known or later developed, without compensation.'
    check (char_length(release_form_text) between 1 and 20000),
  release_form_version   integer not null default 1,
  created_by             uuid references public.profiles (id) on delete set null,

  -- Billing (written only by the Stripe webhook via service_role)
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  subscription_status    public.subscription_status,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 3.3 organization_members — user ↔ org with role.
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.org_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- 3.4 organization_invitations — email invite, accepted via token.
create table public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(email) and email like '%_@_%'),
  role            public.org_role not null default 'member' check (role <> 'owner'),
  token_hash      bytea not null unique,  -- sha256(raw token); raw token is emailed, never stored
  invited_by      uuid references public.profiles (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index organization_invitations_org_idx on public.organization_invitations (organization_id);
create unique index organization_invitations_pending_email_key
  on public.organization_invitations (organization_id, email)
  where accepted_at is null;

-- 3.5 episodes
create table public.episodes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 200),
  description     text check (char_length(description) <= 5000),
  episode_number  integer check (episode_number > 0),
  status          public.episode_status not null default 'draft',
  recording_at    timestamptz,
  publish_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Target for composite FKs so children can't reference another tenant's episode.
  unique (organization_id, id)
);

create index episodes_org_status_idx    on public.episodes (organization_id, status);
create index episodes_org_recording_idx on public.episodes (organization_id, recording_at desc);

-- 3.6 guests — org-level guest directory (a guest can appear on many episodes).
create table public.guests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name       text not null check (char_length(full_name) between 1 and 120),
  email           text check (email = lower(email) and email like '%_@_%'),
  internal_notes  text check (char_length(internal_notes) <= 5000),  -- never shown to guest
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create index guests_org_name_idx on public.guests (organization_id, full_name);
create unique index guests_org_email_key on public.guests (organization_id, email)
  where email is not null;

-- 3.7 episode_guests — a booking: guest X on episode Y. Owns the onboarding
--     token and status. The guest portal URL is /submit/<raw token>.
create table public.episode_guests (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  episode_id         uuid not null,
  guest_id           uuid not null,
  status             public.onboarding_status not null default 'pending',
  token_hash         bytea unique,       -- sha256(raw token); NULL until a link is issued
  token_expires_at   timestamptz,
  token_last_used_at timestamptz,
  submitted_at       timestamptz,
  ready_at           timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (organization_id, episode_id)
    references public.episodes (organization_id, id) on delete cascade,
  foreign key (organization_id, guest_id)
    references public.guests (organization_id, id) on delete cascade,
  unique (episode_id, guest_id),
  unique (organization_id, id),
  check ((token_hash is null) = (token_expires_at is null))
);

create index episode_guests_org_status_idx on public.episode_guests (organization_id, status);
create index episode_guests_episode_idx    on public.episode_guests (episode_id);
create index episode_guests_guest_idx      on public.episode_guests (guest_id);

-- 3.8 submissions — what the guest filled in on the portal (1:1 with booking).
create table public.submissions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  episode_guest_id      uuid not null unique,

  display_name          text check (char_length(display_name) <= 120),
  headline              text check (char_length(headline) <= 160),   -- "Founder, Acme"
  short_bio             text check (char_length(short_bio) <= 300),
  long_bio              text check (char_length(long_bio) <= 5000),
  pronouns              text check (char_length(pronouns) <= 40),
  name_pronunciation    text check (char_length(name_pronunciation) <= 120),
  website_url           text check (char_length(website_url) <= 500),
  -- { "x": "...", "linkedin": "...", "instagram": "...", ... } — shape enforced by Zod
  social_links          jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(social_links) = 'object'
                               and pg_column_size(social_links) <= 8192),
  headshot_path         text,  -- storage object key in bucket guest-assets

  -- Signed release evidence (immutable to authenticated users)
  release_signed_name   text check (char_length(release_signed_name) between 1 and 120),
  release_signed_at     timestamptz,
  release_version       integer,
  release_text_snapshot text,
  release_ip            inet,
  release_user_agent    text check (char_length(release_user_agent) <= 1000),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (organization_id, episode_guest_id)
    references public.episode_guests (organization_id, id) on delete cascade,
  check ((release_signed_at is null) = (release_signed_name is null))
);

create index submissions_org_idx on public.submissions (organization_id);

-- 3.9 stripe_events — webhook idempotency log. service_role only.
create table public.stripe_events (
  id           text primary key,  -- evt_...
  type         text not null,
  processed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. RLS helper functions
--    SECURITY DEFINER so they can read organization_members without recursing
--    into that table's own RLS. `(select auth.uid())` lets Postgres cache the
--    value per statement instead of per row.
-- -----------------------------------------------------------------------------

create function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

create function public.shares_org_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members them
      on them.organization_id = me.organization_id
    where me.user_id = (select auth.uid())
      and them.user_id = p_user
  );
$$;

-- Extracts the org id from a storage key "<org_id>/<booking_id>/<file>".
-- Returns NULL (→ access denied) for malformed keys instead of raising.
create function public.storage_object_org_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Billing gate, used by server actions (not RLS: lapsed customers can still
-- read and export their data).
create function public.org_has_active_subscription(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_org
      and o.subscription_status in ('trialing', 'active')
      and (o.current_period_end is null or o.current_period_end > now())
  ) and public.is_org_member(p_org);
$$;

-- Raw tokens: 32 random bytes, base64url (43 chars).
create function public.generate_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
$$;

create function public.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(p_token, 'sha256');
$$;

-- -----------------------------------------------------------------------------
-- 5. Domain triggers
-- -----------------------------------------------------------------------------

-- 5.1 Create a profile for each new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    left(new.raw_user_meta_data ->> 'full_name', 120),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.2 Bump release version whenever the release text changes, so each
--     submission records exactly which wording the guest agreed to.
create function public.bump_release_form_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.release_form_text is distinct from old.release_form_text then
    new.release_form_version = old.release_form_version + 1;
  end if;
  return new;
end;
$$;

create trigger organizations_bump_release_version
  before update of release_form_text on public.organizations
  for each row execute function public.bump_release_form_version();

-- 5.3 Every org keeps at least one owner (skipped when the org itself is
--     being deleted and members cascade away).
create function public.ensure_org_has_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id
         and m.role = 'owner'
         and m.user_id <> old.user_id
     )
  then
    raise exception 'an organization must keep at least one owner' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger organization_members_keep_owner
  before update of role or delete on public.organization_members
  for each row execute function public.ensure_org_has_owner();

-- 5.4 Keep ready_at in sync with status.
create function public.sync_episode_guest_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.ready_at = case when new.status = 'ready' then now() else null end;
  end if;
  return new;
end;
$$;

create trigger episode_guests_sync_status
  before update of status on public.episode_guests
  for each row execute function public.sync_episode_guest_status();

-- 5.5 updated_at + tenant immutability
create trigger profiles_set_updated_at        before update on public.profiles        for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at   before update on public.organizations   for each row execute function public.set_updated_at();
create trigger episodes_set_updated_at        before update on public.episodes        for each row execute function public.set_updated_at();
create trigger guests_set_updated_at          before update on public.guests          for each row execute function public.set_updated_at();
create trigger episode_guests_set_updated_at  before update on public.episode_guests  for each row execute function public.set_updated_at();
create trigger submissions_set_updated_at     before update on public.submissions     for each row execute function public.set_updated_at();

create trigger episodes_lock_org       before update on public.episodes       for each row execute function public.prevent_organization_id_change();
create trigger guests_lock_org         before update on public.guests         for each row execute function public.prevent_organization_id_change();
create trigger episode_guests_lock_org before update on public.episode_guests for each row execute function public.prevent_organization_id_change();
create trigger submissions_lock_org    before update on public.submissions    for each row execute function public.prevent_organization_id_change();

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.organizations            enable row level security;
alter table public.organization_members     enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.episodes                 enable row level security;
alter table public.guests                   enable row level security;
alter table public.episode_guests           enable row level security;
alter table public.submissions              enable row level security;
alter table public.stripe_events            enable row level security;  -- no policies: service_role only

-- 6.1 profiles: see yourself and teammates; edit only yourself.
create policy "profiles: read self and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 6.2 organizations: members read; owners/admins update (non-billing columns,
--     see grants). Insert via create_organization(); delete via server action.
create policy "organizations: members read" on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy "organizations: admins update" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, '{owner,admin}'))
  with check (public.has_org_role(id, '{owner,admin}'));

-- 6.3 organization_members: members see the roster; owners change roles;
--     owners remove anyone, admins remove non-owners, anyone can leave.
--     Insert via create_organization() / accept_invitation().
create policy "members: read roster" on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy "members: owners change roles" on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, '{owner}'))
  with check (public.has_org_role(organization_id, '{owner}'));

create policy "members: remove" on public.organization_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_org_role(organization_id, '{owner}')
    or (public.has_org_role(organization_id, '{admin}') and role <> 'owner')
  );

-- 6.4 organization_invitations: owners/admins list and revoke.
--     Insert via create_invitation(); accept via accept_invitation().
create policy "invitations: admins read" on public.organization_invitations
  for select to authenticated
  using (public.has_org_role(organization_id, '{owner,admin}'));

create policy "invitations: admins revoke" on public.organization_invitations
  for delete to authenticated
  using (public.has_org_role(organization_id, '{owner,admin}'));

-- 6.5 ── TENANT POLICY TEMPLATE ───────────────────────────────────────────────
--     Copy this block for every new tenant-owned table:
--
--       alter table public.<t> enable row level security;
--       create policy "<t>: members read"   on public.<t> for select to authenticated
--         using (public.is_org_member(organization_id));
--       create policy "<t>: members insert" on public.<t> for insert to authenticated
--         with check (public.is_org_member(organization_id));
--       create policy "<t>: members update" on public.<t> for update to authenticated
--         using (public.is_org_member(organization_id))
--         with check (public.is_org_member(organization_id));
--       create policy "<t>: admins delete"  on public.<t> for delete to authenticated
--         using (public.has_org_role(organization_id, '{owner,admin}'));
--       create trigger <t>_lock_org before update on public.<t>
--         for each row execute function public.prevent_organization_id_change();
--     ─────────────────────────────────────────────────────────────────────────

-- episodes
create policy "episodes: members read" on public.episodes
  for select to authenticated using (public.is_org_member(organization_id));
create policy "episodes: members insert" on public.episodes
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy "episodes: members update" on public.episodes
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy "episodes: admins delete" on public.episodes
  for delete to authenticated using (public.has_org_role(organization_id, '{owner,admin}'));

-- guests
create policy "guests: members read" on public.guests
  for select to authenticated using (public.is_org_member(organization_id));
create policy "guests: members insert" on public.guests
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy "guests: members update" on public.guests
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy "guests: admins delete" on public.guests
  for delete to authenticated using (public.has_org_role(organization_id, '{owner,admin}'));

-- episode_guests (tokens issued via issue_onboarding_token())
create policy "episode_guests: members read" on public.episode_guests
  for select to authenticated using (public.is_org_member(organization_id));
create policy "episode_guests: members insert" on public.episode_guests
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy "episode_guests: members update" on public.episode_guests
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy "episode_guests: members delete" on public.episode_guests
  for delete to authenticated using (public.is_org_member(organization_id));

-- submissions (created by the guest portal; hosts may fix typos in content)
create policy "submissions: members read" on public.submissions
  for select to authenticated using (public.is_org_member(organization_id));
create policy "submissions: members update content" on public.submissions
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- -----------------------------------------------------------------------------
-- 7. RPCs
-- -----------------------------------------------------------------------------

-- 7.1 Create an org and make the caller its owner, atomically.
create function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (p_name, lower(p_slug), v_uid)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, v_uid, 'owner');

  return v_org;
end;
$$;

-- 7.2 Invite a teammate. Returns the raw token (email it as /invite/<token>).
create function public.create_invitation(p_org uuid, p_email text, p_role public.org_role default 'member')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := public.generate_token();
begin
  if not public.has_org_role(p_org, '{owner,admin}') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot invite as owner' using errcode = '22023';
  end if;

  -- Re-inviting replaces any pending invite for this address.
  delete from public.organization_invitations
  where organization_id = p_org and email = lower(p_email) and accepted_at is null;

  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org, lower(p_email), p_role, public.hash_token(v_token), auth.uid());

  return v_token;
end;
$$;

-- 7.3 Accept an invite. The signed-in user's email must match the invite.
create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(auth.jwt() ->> 'email');
  v_invite public.organization_invitations;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_invite
  from public.organization_invitations
  where token_hash = public.hash_token(p_token)
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found or v_invite.email is distinct from v_email then
    raise exception 'invitation is invalid or expired' using errcode = 'P0002';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_invite.organization_id, v_uid, v_invite.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invitations
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.organization_id;
end;
$$;

-- 7.4 Issue (or rotate) a guest onboarding link. Returns the raw token, which
--     is shown to the host once; issuing again invalidates the previous link.
create function public.issue_onboarding_token(p_episode_guest_id uuid, p_ttl interval default interval '30 days')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := public.generate_token();
  v_org   uuid;
begin
  select organization_id into v_org
  from public.episode_guests
  where id = p_episode_guest_id;

  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_ttl <= interval '0' or p_ttl > interval '180 days' then
    raise exception 'ttl must be between 0 and 180 days' using errcode = '22023';
  end if;

  update public.episode_guests
  set token_hash = public.hash_token(v_token),
      token_expires_at = now() + p_ttl
  where id = p_episode_guest_id;

  return v_token;
end;
$$;

-- 7.5 PORTAL (service_role only): load everything /submit/[token] renders.
--     Returns NULL for unknown, expired, or cancelled links.
create function public.get_onboarding_context(p_token text)
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
    'organization',      jsonb_build_object('name', o.name, 'logo_url', o.logo_url),
    'episode',           jsonb_build_object('title', e.title, 'recording_at', e.recording_at),
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

-- 7.6 PORTAL (service_role only): save the guest's submission and signature.
--     The server action has already validated p_payload with Zod; the checks
--     here are the last line of defence.
create function public.submit_onboarding(
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
  -- Headshot must live under this booking's prefix (as issued by the upload action).
  if v_headshot is not null
     and v_headshot not like v_booking.organization_id::text || '/' || v_booking.id::text || '/%' then
    raise exception 'invalid headshot path' using errcode = '22023';
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

-- -----------------------------------------------------------------------------
-- 8. Privileges
--    RLS decides WHICH rows; grants decide WHICH columns/operations.
-- -----------------------------------------------------------------------------

-- anon: nothing. (Supabase grants everything to anon by default.)
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon, public;

-- stripe_events: service_role only.
revoke all on public.stripe_events from authenticated;

-- profiles: only name/avatar are user-editable.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- organizations: billing columns are webhook-only.
revoke insert, update, delete on public.organizations from authenticated;
grant update (name, slug, logo_url, release_form_text) on public.organizations to authenticated;

-- organization_members: role is the only mutable column.
revoke insert, update on public.organization_members from authenticated;
grant update (role) on public.organization_members to authenticated;

-- organization_invitations: created via RPC only.
revoke insert, update on public.organization_invitations from authenticated;

-- episode_guests: tokens and timestamps are managed by RPCs/triggers.
revoke insert, update on public.episode_guests from authenticated;
grant insert (organization_id, episode_id, guest_id, created_by) on public.episode_guests to authenticated;
grant update (status) on public.episode_guests to authenticated;

-- submissions: created by portal RPC; release evidence is immutable.
revoke insert, update, delete on public.submissions from authenticated;
grant update (display_name, headline, short_bio, long_bio, pronouns,
              name_pronunciation, website_url, social_links, headshot_path)
  on public.submissions to authenticated;

-- Functions callable by signed-in users (RLS helpers + dashboard RPCs).
grant execute on function
  public.is_org_member(uuid),
  public.has_org_role(uuid, public.org_role[]),
  public.shares_org_with(uuid),
  public.storage_object_org_id(text),
  public.org_has_active_subscription(uuid),
  public.create_organization(text, text),
  public.create_invitation(uuid, text, public.org_role),
  public.accept_invitation(text),
  public.issue_onboarding_token(uuid, interval)
to authenticated;

-- Internal helpers and portal RPCs: never callable through the public API.
revoke execute on function
  public.generate_token(),
  public.hash_token(text),
  public.get_onboarding_context(text),
  public.submit_onboarding(text, jsonb, inet, text)
from authenticated;

grant execute on function
  public.get_onboarding_context(text),
  public.submit_onboarding(text, jsonb, inet, text)
to service_role;

-- -----------------------------------------------------------------------------
-- 9. Storage — private bucket, keys "<org_id>/<episode_guest_id>/<file>"
--    Guests upload through signed upload URLs minted server-side
--    (service_role, after validating their token). Hosts read through
--    short-lived signed URLs, which the select policy below authorises.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-assets', 'guest-assets', false, 10485760,  -- 10 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "guest-assets: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'guest-assets'
         and public.is_org_member(public.storage_object_org_id(name)));

create policy "guest-assets: members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'guest-assets'
              and public.is_org_member(public.storage_object_org_id(name)));

create policy "guest-assets: members update" on storage.objects
  for update to authenticated
  using (bucket_id = 'guest-assets'
         and public.is_org_member(public.storage_object_org_id(name)))
  with check (bucket_id = 'guest-assets'
              and public.is_org_member(public.storage_object_org_id(name)));

create policy "guest-assets: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'guest-assets'
         and public.has_org_role(public.storage_object_org_id(name), '{owner,admin}'));
