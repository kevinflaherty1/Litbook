-- =============================================================================
-- Phase 7: email onboarding links to guests, and automatic reminders
--   - episode_guests tracks whether Litbook emailed the current link, and
--     when/how often it reminded the guest.
--   - organizations.guest_reminders_enabled lets a workspace opt out.
--   - Raw tokens are still never stored. A reminder carries a fresh link,
--     which replaces the old one only after the email was sent
--     (set_onboarding_token), so a failed send never breaks a working link.
-- =============================================================================

alter table public.episode_guests
  add column link_emailed_at  timestamptz,
  add column last_reminder_at timestamptz,
  add column reminder_count   integer not null default 0 check (reminder_count >= 0);

alter table public.organizations
  add column guest_reminders_enabled boolean not null default true;
grant update (guest_reminders_enabled) on public.organizations to authenticated;

-- issue_onboarding_token(): same as before, plus whether this link is being
-- emailed by Litbook. Only emailed links get reminders (a link the host
-- shared some other way must never be rotated behind their back).
drop function public.issue_onboarding_token(uuid, interval);
create function public.issue_onboarding_token(
  p_episode_guest_id uuid,
  p_ttl              interval default interval '30 days',
  p_emailed          boolean  default false
)
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
  set token_hash       = public.hash_token(v_token),
      token_expires_at = now() + p_ttl,
      link_emailed_at  = case when p_emailed then now() end,
      last_reminder_at = null,
      reminder_count   = 0
  where id = p_episode_guest_id;

  return v_token;
end;
$$;

-- Claims up to p_limit bookings that are due a reminder, marking each as
-- reminded now so concurrent runs can't double-send (SKIP LOCKED). Due means:
-- still pending, link emailed by Litbook and not expired, guest has an email,
-- fewer than p_max reminders, and the last email was at least p_gap ago.
create function public.claim_onboarding_reminders(
  p_limit integer  default 50,
  p_gap   interval default interval '3 days',
  p_max   integer  default 2
)
returns table (
  episode_guest_id  uuid,
  organization_name text,
  episode_title     text,
  recording_at      timestamptz,
  guest_name        text,
  guest_email       text,
  reminder_number   integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select eg.id
    from public.episode_guests eg
    join public.organizations o on o.id = eg.organization_id
    join public.guests g        on g.id = eg.guest_id
    where eg.status = 'pending'
      and eg.submitted_at is null
      and eg.link_emailed_at is not null
      and eg.token_expires_at > now() + interval '1 day'
      and eg.reminder_count < p_max
      and coalesce(eg.last_reminder_at, eg.link_emailed_at) <= now() - p_gap
      and g.email is not null
      and o.guest_reminders_enabled
    order by coalesce(eg.last_reminder_at, eg.link_emailed_at)
    limit p_limit
    for update of eg skip locked
  ), claimed as (
    update public.episode_guests eg
    set last_reminder_at = now(),
        reminder_count   = eg.reminder_count + 1
    from due
    where eg.id = due.id
    returning eg.id, eg.organization_id, eg.episode_id, eg.guest_id, eg.reminder_count
  )
  select c.id, o.name, e.title, e.recording_at, g.full_name, g.email, c.reminder_count
  from claimed c
  join public.organizations o on o.id = c.organization_id
  join public.episodes e      on e.id = c.episode_id
  join public.guests g        on g.id = c.guest_id;
end;
$$;

-- Swaps in a token the server generated and already emailed. Only applies
-- while the booking is still pending, so it can't revive a cancelled link.
create function public.set_onboarding_token(
  p_episode_guest_id uuid,
  p_token            text,
  p_ttl              interval default interval '30 days'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or char_length(p_token) not between 32 and 128 then
    raise exception 'invalid token' using errcode = '22023';
  end if;

  update public.episode_guests
  set token_hash       = public.hash_token(p_token),
      token_expires_at = now() + p_ttl
  where id = p_episode_guest_id
    and status = 'pending';
  return found;
end;
$$;

revoke execute on function
  public.issue_onboarding_token(uuid, interval, boolean),
  public.claim_onboarding_reminders(integer, interval, integer),
  public.set_onboarding_token(uuid, text, interval)
from public, anon, authenticated;
grant execute on function public.issue_onboarding_token(uuid, interval, boolean) to authenticated;
grant execute on function
  public.claim_onboarding_reminders(integer, interval, integer),
  public.set_onboarding_token(uuid, text, interval)
to service_role;
