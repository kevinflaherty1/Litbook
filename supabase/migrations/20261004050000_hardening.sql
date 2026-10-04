-- =============================================================================
-- Phase 6 hardening: functions added after the initial migration picked up
-- Supabase's default EXECUTE grants. Trigger functions can't be called
-- directly anyway, but nothing in public should be executable by anon.
-- (pgTAP's coverage tests enforce this for every future migration.)
-- =============================================================================

revoke execute on function public.set_created_by()             from public, anon, authenticated;
revoke execute on function public.guard_episode_guest_status() from public, anon, authenticated;
