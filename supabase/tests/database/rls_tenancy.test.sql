-- Tenancy & privilege tests. Run with: pnpm db:test  (supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
--   Alice: owner of org A        Carol: member of org A
--   Bob:   owner of org B        Dave:  no org
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000000', 'alice@example.com', '{"full_name":"Alice"}'),
  ('b0000000-0000-0000-0000-000000000000', 'bob@example.com',   '{}'),
  ('c0000000-0000-0000-0000-000000000000', 'carol@example.com', '{}'),
  ('d0000000-0000-0000-0000-000000000000', 'dave@example.com',  '{}');

select is((select count(*)::int from public.profiles where email like '%@example.com'
            and id in ('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000',
                       'c0000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000000')),
          4, 'sign-up trigger creates a profile per user');
select is((select full_name from public.profiles where id = 'a0000000-0000-0000-0000-000000000000'),
          'Alice', 'profile copies full_name from auth metadata');

insert into public.organizations (id, name, slug) values
  ('0a000000-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('0b000000-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'owner'),
  ('0a000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'member'),
  ('0b000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'owner');
insert into public.episodes (id, organization_id, title) values
  ('e0a00000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'A1'),
  ('e0b00000-0000-0000-0000-000000000000', '0b000000-0000-0000-0000-000000000000', 'B1');
insert into public.guests (id, organization_id, full_name) values
  ('90a00000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'Guest A'),
  ('90b00000-0000-0000-0000-000000000000', '0b000000-0000-0000-0000-000000000000', 'Guest B');
insert into public.episode_guests (id, organization_id, episode_id, guest_id, token_hash, token_expires_at) values
  ('ea000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000',
   'e0a00000-0000-0000-0000-000000000000', '90a00000-0000-0000-0000-000000000000',
   public.hash_token('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), now() + interval '1 day');
insert into public.organization_invitations (organization_id, email, role, token_hash) values
  ('0a000000-0000-0000-0000-000000000000', 'dave@example.com', 'member',
   public.hash_token('invite-token-ddddddddddddddddddddddddddddddd'));

create function pg_temp.login(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text,
                    true);
$$;

-- ---------------------------------------------------------------------------
-- anon: no access at all
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.episodes', '42501', null, 'anon cannot read episodes');
select throws_ok('select count(*) from public.organizations', '42501', null, 'anon cannot read organizations');
select throws_ok($$select public.get_onboarding_context('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
                 '42501', null, 'anon cannot call portal RPCs directly');
reset role;

-- ---------------------------------------------------------------------------
-- Bob (org B) cannot see or touch org A
-- ---------------------------------------------------------------------------
select pg_temp.login('b0000000-0000-0000-0000-000000000000', 'bob@example.com');
set local role authenticated;

select results_eq('select slug from public.organizations', $$values ('org-b')$$, 'Bob sees only his org');
select is((select count(*)::int from public.episodes where organization_id = '0a000000-0000-0000-0000-000000000000'),
          0, 'Bob cannot read org A episodes');
select is((select count(*)::int from public.guests where organization_id = '0a000000-0000-0000-0000-000000000000'),
          0, 'Bob cannot read org A guests');
select is((select count(*)::int from public.episode_guests where organization_id = '0a000000-0000-0000-0000-000000000000'),
          0, 'Bob cannot read org A bookings');
select is((select count(*)::int from public.profiles), 1, 'Bob sees only his own profile');
select is((select count(*)::int from public.organization_invitations), 0, 'Bob cannot see org A invitations');

select throws_ok($$insert into public.episodes (organization_id, title)
                   values ('0a000000-0000-0000-0000-000000000000', 'x')$$,
                 '42501', null, 'Bob cannot insert into org A');
select throws_ok($$insert into public.episode_guests (organization_id, episode_id, guest_id)
                   values ('0b000000-0000-0000-0000-000000000000',
                           'e0b00000-0000-0000-0000-000000000000',
                           '90a00000-0000-0000-0000-000000000000')$$,
                 '23503', null, 'composite FK blocks booking another org''s guest');

update public.episodes set title = 'hacked' where id = 'e0a00000-0000-0000-0000-000000000000';
delete from public.guests where id = '90a00000-0000-0000-0000-000000000000';
select throws_ok($$select public.issue_onboarding_token('ea000000-0000-0000-0000-000000000000')$$,
                 '42501', null, 'Bob cannot issue links for org A bookings');
select throws_ok($$select public.create_invitation('0a000000-0000-0000-0000-000000000000', 'x@example.com')$$,
                 '42501', null, 'Bob cannot invite into org A');
select is(public.is_org_member('0a000000-0000-0000-0000-000000000000'), false, 'is_org_member is false for non-members');

reset role;
select is((select title from public.episodes where id = 'e0a00000-0000-0000-0000-000000000000'),
          'A1', 'Bob''s cross-tenant update affected nothing');
select is((select count(*)::int from public.guests where id = '90a00000-0000-0000-0000-000000000000'),
          1, 'Bob''s cross-tenant delete affected nothing');

-- ---------------------------------------------------------------------------
-- Carol (member of A): reads org data, but cannot do admin things
-- ---------------------------------------------------------------------------
select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;

select is((select count(*)::int from public.episodes), 1, 'Carol sees org A episodes');
select is((select count(*)::int from public.profiles), 2, 'Carol sees herself and her teammate');
select throws_ok($$update public.organizations set subscription_status = 'active'$$,
                 '42501', null, 'members cannot write billing columns');
update public.organizations set name = 'Renamed by member';
update public.organization_members set role = 'owner'
  where user_id = 'c0000000-0000-0000-0000-000000000000';
delete from public.episodes where id = 'e0a00000-0000-0000-0000-000000000000';
select throws_ok($$update public.episode_guests set token_hash = '\x00'$$,
                 '42501', null, 'members cannot set token hashes directly');
select throws_ok($$select public.create_invitation('0a000000-0000-0000-0000-000000000000', 'x@example.com')$$,
                 '42501', null, 'members cannot invite');
select lives_ok($$select public.issue_onboarding_token('ea000000-0000-0000-0000-000000000000')$$,
                'members can issue onboarding links');

reset role;
select is((select name from public.organizations where id = '0a000000-0000-0000-0000-000000000000'),
          'Org A', 'members cannot rename the org');
select is((select role::text from public.organization_members
           where user_id = 'c0000000-0000-0000-0000-000000000000'), 'member', 'members cannot promote themselves');
select is((select count(*)::int from public.episodes where id = 'e0a00000-0000-0000-0000-000000000000'),
          1, 'members cannot delete episodes');
-- Carol's issue_onboarding_token rotated the link; restore the known token.
update public.episode_guests
  set token_hash = public.hash_token('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  where id = 'ea000000-0000-0000-0000-000000000000';

-- ---------------------------------------------------------------------------
-- Alice (owner of A)
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;

select throws_ok($$delete from public.organization_members
                   where user_id = 'a0000000-0000-0000-0000-000000000000'$$,
                 '23514', null, 'the last owner cannot leave');
with bumped as (
  update public.organizations set release_form_text = 'v2 text'
  where id = '0a000000-0000-0000-0000-000000000000'
  returning release_form_version
)
select is((select release_form_version from bumped), 2, 'changing the release text bumps its version');
select throws_ok($$update public.organizations set slug = 'login'
                   where id = '0a000000-0000-0000-0000-000000000000'$$,
                 '23514', null, 'reserved slugs are rejected');
select is((public.create_organization('Alice Two', 'alice-two')).slug, 'alice-two',
          'create_organization returns the new org');
select is((select role::text from public.organization_members m
           join public.organizations o on o.id = m.organization_id
           where o.slug = 'alice-two' and m.user_id = 'a0000000-0000-0000-0000-000000000000'),
          'owner', 'creator becomes owner');

-- ---------------------------------------------------------------------------
-- Invitations: preview + accept, email must match
-- ---------------------------------------------------------------------------
select is(public.get_invitation_preview('invite-token-ddddddddddddddddddddddddddddddd') ->> 'organization_name',
          'Org A', 'anyone signed in with the token can preview the invite');
select throws_ok($$select public.accept_invitation('invite-token-ddddddddddddddddddddddddddddddd')$$,
                 'P0002', null, 'invite cannot be accepted by a different email');

select pg_temp.login('d0000000-0000-0000-0000-000000000000', 'dave@example.com');
select is(public.accept_invitation('invite-token-ddddddddddddddddddddddddddddddd'),
          '0a000000-0000-0000-0000-000000000000'::uuid, 'invited user can accept');
select is((select count(*)::int from public.episodes), 1, 'new member sees org data');
select throws_ok($$select public.accept_invitation('invite-token-ddddddddddddddddddddddddddddddd')$$,
                 'P0002', null, 'invites are single-use');
reset role;

-- ---------------------------------------------------------------------------
-- Guest portal RPCs (service_role)
-- ---------------------------------------------------------------------------
set local role service_role;
select is(public.get_onboarding_context('not-a-real-token-xxxxxxxxxxxxxxxxxxxxxxx'), null,
          'unknown portal token returns null');
select throws_ok($$select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                   '{"release_accepted": true, "release_signed_name": "G",
                     "headshot_path": "0b000000-0000-0000-0000-000000000000/x/h.jpg"}')$$,
                 '22023', null, 'headshot must be under the booking''s own prefix');
select throws_ok($$select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                   '{"release_accepted": true, "release_signed_name": "G",
                     "headshot_path": "0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/missing.jpg"}')$$,
                 '22023', null, 'headshot must actually have been uploaded');
select public.record_onboarding_visit('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
select isnt((select token_last_used_at from public.episode_guests
             where id = 'ea000000-0000-0000-0000-000000000000'), null, 'opening the link is recorded');
select results_eq($$select public.check_rate_limit('test:key', 2, 60) from generate_series(1, 3)$$,
                  $$values (true), (true), (false)$$, 'rate limit allows N hits per window');
select lives_ok($$select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  '{"short_bio": "Hi", "release_accepted": true, "release_signed_name": "Guest A"}',
                  '203.0.113.7', 'test-agent')$$,
                'valid submission is accepted');
select is((select release_text_snapshot from public.submissions
           where episode_guest_id = 'ea000000-0000-0000-0000-000000000000'),
          'v2 text', 'submission snapshots the current release text');
reset role;

select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select throws_ok($$update public.submissions set release_signed_name = 'Forged'$$,
                 '42501', null, 'signed release evidence is immutable');
select throws_ok($$select public.check_rate_limit('x', 1, 60)$$, '42501', null,
                 'signed-in users cannot touch rate limits');
select throws_ok($$select count(*) from public.rate_limits$$, '42501', null,
                 'signed-in users cannot read rate limits');
reset role;

-- ---------------------------------------------------------------------------
-- Phase 2: created_by attribution and booking status rules
-- ---------------------------------------------------------------------------
select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;

with ins as (
  insert into public.episodes (organization_id, title, created_by)
  values ('0a000000-0000-0000-0000-000000000000', 'Forged', 'a0000000-0000-0000-0000-000000000000')
  returning created_by
)
select is((select created_by from ins), 'c0000000-0000-0000-0000-000000000000'::uuid,
          'created_by is always the signed-in user');
select throws_ok($$update public.guests set created_by = 'a0000000-0000-0000-0000-000000000000'$$,
                 '42501', null, 'created_by cannot be changed');

-- Guest A2 in org A has a booking with no submission yet.
insert into public.guests (id, organization_id, full_name)
  values ('90a20000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'Guest A2');
insert into public.episode_guests (organization_id, episode_id, guest_id)
  values ('0a000000-0000-0000-0000-000000000000',
          'e0a00000-0000-0000-0000-000000000000', '90a20000-0000-0000-0000-000000000000');

select throws_ok($$update public.episode_guests set status = 'assets_submitted'
                   where guest_id = '90a20000-0000-0000-0000-000000000000'$$,
                 '22023', null, 'hosts cannot fake a submission');
select throws_ok($$update public.episode_guests set status = 'ready'
                   where guest_id = '90a20000-0000-0000-0000-000000000000'$$,
                 '22023', null, 'nothing submitted means it cannot be marked ready');
select lives_ok($$update public.episode_guests set status = 'cancelled'
                  where guest_id = '90a20000-0000-0000-0000-000000000000'$$, 'hosts can cancel a booking');
select lives_ok($$update public.episode_guests set status = 'pending'
                  where guest_id = '90a20000-0000-0000-0000-000000000000'$$,
                'a cancelled booking without a submission is restored to pending');
-- Guest A's booking has a submission (from the portal tests above).
select throws_ok($$update public.episode_guests set status = 'pending'
                   where id = 'ea000000-0000-0000-0000-000000000000'$$,
                 '22023', null, 'a submitted booking cannot go back to pending');
reset role;

-- ---------------------------------------------------------------------------
-- Phase 5: billing webhook writes and the subscription gate
-- ---------------------------------------------------------------------------
set local role service_role;
select is(public.apply_stripe_subscription('0a000000-0000-0000-0000-000000000000', 'cus_A', 'sub_A', 'price_pro',
            'active', now() + interval '30 days', false, '2026-01-01 00:00:10+00'),
          '0a000000-0000-0000-0000-000000000000'::uuid, 'webhook applies a subscription');
-- An older event (e.g. a retried subscription.created) is ignored.
select public.apply_stripe_subscription(null, 'cus_A', null, null, 'incomplete', null, null, '2026-01-01 00:00:05+00');
select is((select subscription_status::text from public.organizations where id = '0a000000-0000-0000-0000-000000000000'),
          'active', 'out-of-order events cannot roll status back');
-- An ids-only update with a later timestamp doesn't block status events.
select public.apply_stripe_subscription('0a000000-0000-0000-0000-000000000000', 'cus_A', 'sub_A', null, null, null, null,
                                        '2026-01-01 00:00:20+00');
select public.apply_stripe_subscription(null, 'cus_A', null, null, 'past_due', null, null, '2026-01-01 00:00:15+00');
select is((select subscription_status::text from public.organizations where id = '0a000000-0000-0000-0000-000000000000'),
          'past_due', 'checkout ids-only updates do not swallow status events');
select is(public.apply_stripe_subscription(null, 'cus_unknown', null, null, 'active', null, null, now()), null,
          'unknown customers are ignored');
reset role;

select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select is(public.org_has_active_subscription('0a000000-0000-0000-0000-000000000000'), false, 'past_due is not active');
select throws_ok($$select public.apply_stripe_subscription('0a000000-0000-0000-0000-000000000000', 'x', 'x', 'x',
                   'active', null, false, now())$$, '42501', null, 'signed-in users cannot write billing');
reset role;
update public.organizations set subscription_status = 'active', current_period_end = now() - interval '1 day'
  where id = '0a000000-0000-0000-0000-000000000000';
set local role authenticated;
select is(public.org_has_active_subscription('0a000000-0000-0000-0000-000000000000'), true,
          'a just-lapsed period still counts during the grace window');
reset role;

-- ---------------------------------------------------------------------------
-- Coverage: every table, now and in future migrations
-- ---------------------------------------------------------------------------
select is_empty($$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
                'every public table has row level security enabled');
select is_empty($$select table_name || ':' || privilege_type from information_schema.role_table_grants
                  where table_schema = 'public' and grantee = 'anon'$$,
                'anon has no privileges on any public table');
select is_empty($$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')$$,
                'anon cannot execute any public function');
select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select throws_ok('select count(*) from public.stripe_events', '42501', null, 'signed-in users cannot read stripe events');
reset role;

select * from finish();
rollback;
