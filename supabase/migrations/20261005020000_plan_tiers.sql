-- =============================================================================
-- Phase 11: plan tiers
--   organizations.plan ('starter' | 'pro') is set by the Stripe webhook from
--   the subscription's price. NULL means no plan limits apply: billing is off
--   for the deployment, or the org predates tiers. (Orgs without a live
--   subscription are already blocked from creating things by the paywall.)
--
--   Limits, enforced here so no client can get around them:
--     starter: 2 seats (members + pending invitations), 5 new episodes per
--              calendar month (UTC)
--     pro:     10 seats, unlimited episodes
--   Pro-only features (branding, guest questions, extra files) are gated in
--   the app; they aren't security boundaries.
-- =============================================================================

alter table public.organizations
  add column plan text check (plan in ('starter', 'pro'));
-- (Not added to the authenticated column grants: written by the webhook only.)

-- Keep in sync with src/lib/plans.ts.
create function public.plan_limits(p_plan text, out seats integer, out episodes_per_month integer)
language sql
immutable
set search_path = ''
as $$
  select case p_plan when 'starter' then 2 when 'pro' then 10 end,
         case p_plan when 'starter' then 5 end;
$$;

-- Seats: members plus pending invitations may not exceed the plan.
create function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seats  integer;
  v_used   integer;
  v_joiner text := '';
begin
  select l.seats into v_seats
  from public.organizations o, public.plan_limits(o.plan) l
  where o.id = new.organization_id;
  if v_seats is null then
    return new;
  end if;

  -- Serialise seat changes per org so two concurrent invites can't both fit.
  perform 1 from public.organizations where id = new.organization_id for update;

  -- Accepting an invitation turns its pending seat into a member, so it isn't counted twice.
  if tg_table_name = 'organization_members' then
    select coalesce(p.email, '') into v_joiner from public.profiles p where p.id = new.user_id;
  end if;

  select (select count(*) from public.organization_members m where m.organization_id = new.organization_id)
       + (select count(*) from public.organization_invitations i
          where i.organization_id = new.organization_id and i.accepted_at is null and i.expires_at > now()
            and i.email <> v_joiner)
    into v_used;

  if v_used >= v_seats then
    raise exception 'seat limit reached for this plan' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger organization_invitations_seat_limit
  before insert on public.organization_invitations
  for each row execute function public.enforce_seat_limit();
create trigger organization_members_seat_limit
  before insert on public.organization_members
  for each row execute function public.enforce_seat_limit();

-- Episodes: a monthly allowance of new episodes.
create function public.enforce_episode_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  select l.episodes_per_month into v_limit
  from public.organizations o, public.plan_limits(o.plan) l
  where o.id = new.organization_id;
  if v_limit is null then
    return new;
  end if;

  perform 1 from public.organizations where id = new.organization_id for update;
  if (select count(*) from public.episodes e
      where e.organization_id = new.organization_id
        and e.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc') >= v_limit then
    raise exception 'monthly episode limit reached for this plan' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger episodes_monthly_limit
  before insert on public.episodes
  for each row execute function public.enforce_episode_limit();

-- Usage for the billing page.
create function public.org_plan_usage(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan',               o.plan,
    'seats',              l.seats,
    'episodes_per_month', l.episodes_per_month,
    'members',            (select count(*) from public.organization_members m where m.organization_id = o.id),
    'pending_invites',    (select count(*) from public.organization_invitations i
                           where i.organization_id = o.id and i.accepted_at is null and i.expires_at > now()),
    'episodes_this_month', (select count(*) from public.episodes e
                            where e.organization_id = o.id
                              and e.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc')
  )
  from public.organizations o, public.plan_limits(o.plan) l
  where o.id = p_org and public.is_org_member(p_org);
$$;

-- The webhook now also records the plan. Same ordering rules as before.
drop function public.apply_stripe_subscription(
  uuid, text, text, text, public.subscription_status, timestamptz, boolean, timestamptz);
create function public.apply_stripe_subscription(
  p_org                  uuid,
  p_customer             text,
  p_subscription         text,
  p_price                text,
  p_status               public.subscription_status,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at             timestamptz,
  p_plan                 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations
  where id = p_org or (p_org is null and stripe_customer_id = p_customer)
  limit 1;
  if v_org is null then
    return null;
  end if;

  update public.organizations
  set stripe_customer_id     = coalesce(p_customer, stripe_customer_id),
      stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
      stripe_price_id        = coalesce(p_price, stripe_price_id),
      plan                   = coalesce(p_plan, plan),
      subscription_status    = coalesce(p_status, subscription_status),
      current_period_end     = coalesce(p_current_period_end, current_period_end),
      cancel_at_period_end   = coalesce(p_cancel_at_period_end, cancel_at_period_end),
      billing_event_at       = case when p_status is null then billing_event_at else p_event_at end
  where id = v_org
    and (p_status is null or billing_event_at is null or billing_event_at <= p_event_at);

  return v_org;
end;
$$;

revoke execute on function
  public.plan_limits(text),
  public.enforce_seat_limit(),
  public.enforce_episode_limit(),
  public.org_plan_usage(uuid),
  public.apply_stripe_subscription(uuid, text, text, text, public.subscription_status, timestamptz, boolean, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.org_plan_usage(uuid) to authenticated;
grant execute on function
  public.apply_stripe_subscription(uuid, text, text, text, public.subscription_status, timestamptz, boolean, timestamptz, text)
to service_role;
