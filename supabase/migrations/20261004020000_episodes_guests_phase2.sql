-- =============================================================================
-- Phase 2: episodes, guest directory, bookings
--   1. created_by is always the signed-in user (clients can't attribute rows to
--      someone else).
--   2. Booking status transitions a host may make directly are limited, so a
--      client can't fake "assets_submitted" or set "ready" before Phase 4.
-- =============================================================================

-- 1. created_by ---------------------------------------------------------------
create function public.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() is NULL for service_role and migrations; keep their value.
  new.created_by = coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create trigger episodes_set_created_by       before insert on public.episodes       for each row execute function public.set_created_by();
create trigger guests_set_created_by         before insert on public.guests         for each row execute function public.set_created_by();
create trigger episode_guests_set_created_by before insert on public.episode_guests for each row execute function public.set_created_by();

-- created_by (and organization_id) are fixed at insert time. Column-level
-- revokes don't override a table-level grant, so list the editable columns.
revoke update on public.episodes from authenticated;
grant update (title, description, episode_number, status, recording_at, publish_at)
  on public.episodes to authenticated;
revoke update on public.guests from authenticated;
grant update (full_name, email, internal_notes) on public.guests to authenticated;

-- 2. Booking status -------------------------------------------------------------
-- Signed-in hosts may only cancel a booking or restore a cancelled one to the
-- state its data supports. "assets_submitted" is set by submit_onboarding()
-- (service_role), and "ready" is allowed only once something was submitted.
create function public.guard_episode_guest_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_has_submission boolean;
begin
  if new.status is not distinct from old.status or auth.uid() is null then
    return new;
  end if;

  select exists (select 1 from public.submissions s where s.episode_guest_id = new.id)
    into v_has_submission;

  if new.status = 'cancelled'
     or (new.status = 'pending' and not v_has_submission)
     or (new.status in ('assets_submitted', 'ready') and v_has_submission) then
    return new;
  end if;

  raise exception 'invalid booking status change: % -> %', old.status, new.status
    using errcode = '22023';
end;
$$;

create trigger episode_guests_guard_status
  before update of status on public.episode_guests
  for each row execute function public.guard_episode_guest_status();
