-- =============================================================================
-- Phase 5: Stripe billing
--   1. apply_stripe_subscription(): the webhook's single write path. Ignores
--      events older than the last one applied, so retries and out-of-order
--      delivery can't roll billing state back.
--   2. org_has_active_subscription(): 3 days of grace after current_period_end,
--      so a late renewal webhook doesn't lock anyone out.
-- =============================================================================

alter table public.organizations add column billing_event_at timestamptz;
-- (Not added to the authenticated column grants: written by the webhook only.)

create function public.apply_stripe_subscription(
  p_org                  uuid,
  p_customer             text,
  p_subscription         text,
  p_price                text,
  p_status               public.subscription_status,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at             timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  -- Prefer the org id we put in metadata; fall back to the customer.
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
      subscription_status    = coalesce(p_status, subscription_status),
      current_period_end     = coalesce(p_current_period_end, current_period_end),
      cancel_at_period_end   = coalesce(p_cancel_at_period_end, cancel_at_period_end),
      -- An ids-only update (checkout.session.completed, no status) doesn't take
      -- part in ordering; it must never cause a status event to be skipped.
      billing_event_at       = case when p_status is null then billing_event_at else p_event_at end
  where id = v_org
    and (p_status is null or billing_event_at is null or billing_event_at <= p_event_at);

  return v_org;
end;
$$;

create or replace function public.org_has_active_subscription(p_org uuid)
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
      and (o.current_period_end is null or o.current_period_end > now() - interval '3 days')
  ) and public.is_org_member(p_org);
$$;

revoke execute on function
  public.apply_stripe_subscription(uuid, text, text, text, public.subscription_status, timestamptz, boolean, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.apply_stripe_subscription(uuid, text, text, text, public.subscription_status, timestamptz, boolean, timestamptz)
to service_role;
