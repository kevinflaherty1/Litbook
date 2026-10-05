-- Phases 8+: branding, custom questions, and later additions.
-- Run with: pnpm db:test  (supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, bypassing RLS)
--   Alice: owner of org A        Carol: member of org A
--   Bob:   owner of org B
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000000', 'alice@example.com'),
  ('b0000000-0000-0000-0000-000000000000', 'bob@example.com'),
  ('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
insert into public.organizations (id, name, slug) values
  ('0a000000-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('0b000000-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into public.organization_members (organization_id, user_id, role) values
  ('0a000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'owner'),
  ('0a000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000', 'member'),
  ('0b000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'owner');
insert into public.episodes (id, organization_id, title) values
  ('e0a00000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'A1');
insert into public.guests (id, organization_id, full_name) values
  ('90a00000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'Guest A');
insert into public.episode_guests (id, organization_id, episode_id, guest_id, token_hash, token_expires_at) values
  ('ea000000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000',
   'e0a00000-0000-0000-0000-000000000000', '90a00000-0000-0000-0000-000000000000',
   public.hash_token('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), now() + interval '1 day');

create function pg_temp.login(p_user uuid, p_email text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text,
                    true);
$$;

-- ---------------------------------------------------------------------------
-- Phase 8: branding
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select lives_ok($$update public.organizations
                  set brand_color = '#4f46e5', portal_welcome = 'Hi!',
                      logo_path = '0a000000-0000-0000-0000-000000000000/logo.png'
                  where id = '0a000000-0000-0000-0000-000000000000'$$,
                'admins can set the logo, colour and welcome message');
select throws_ok($$update public.organizations
                   set logo_path = '0b000000-0000-0000-0000-000000000000/logo.png'
                   where id = '0a000000-0000-0000-0000-000000000000'$$,
                 '23514', null, 'a logo must live under the org''s own prefix');
select throws_ok($$update public.organizations set brand_color = 'red'
                   where id = '0a000000-0000-0000-0000-000000000000'$$,
                 '23514', null, 'brand colour must be a hex colour');
reset role;

select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select throws_ok($$insert into storage.objects (bucket_id, name)
                   values ('org-branding', '0a000000-0000-0000-0000-000000000000/x.png')$$,
                 '42501', null, 'members cannot upload a logo');
reset role;

-- ---------------------------------------------------------------------------
-- Phase 8: custom questions
-- ---------------------------------------------------------------------------
select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select throws_ok($$insert into public.custom_fields (organization_id, label)
                   values ('0a000000-0000-0000-0000-000000000000', 'Q')$$,
                 '42501', null, 'members cannot add questions');
reset role;

select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select lives_ok($$insert into public.custom_fields (organization_id, label, field_type, options, required)
                  values ('0a000000-0000-0000-0000-000000000000', 'Topic?', 'select', '{AI,Design}', true),
                         ('0a000000-0000-0000-0000-000000000000', 'Old question', 'short_text', '{}', false)$$,
                'admins can add questions');
select throws_ok($$update public.custom_fields set field_type = 'long_text'
                   where label = 'Topic?'$$,
                 '42501', null, 'a question''s type is fixed');
select throws_ok($$insert into public.custom_fields (organization_id, label, field_type)
                   values ('0a000000-0000-0000-0000-000000000000', 'Pick one', 'select')$$,
                 '23514', null, 'multiple choice needs options');
select lives_ok($$update public.custom_fields set archived_at = now()
                  where label = 'Old question'$$,
                'admins can archive a question');
reset role;

select pg_temp.login('b0000000-0000-0000-0000-000000000000', 'bob@example.com');
set local role authenticated;
select is((select count(*)::int from public.custom_fields), 0, 'other workspaces cannot see the questions');
reset role;

set local role service_role;
select is((select jsonb_path_query_array(
             public.get_onboarding_context('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), '$.custom_fields[*].label')),
          '["Topic?"]'::jsonb, 'the portal gets active questions only');
select is((public.get_onboarding_context('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') -> 'organization' ->> 'brand_color'),
          '#4f46e5', 'the portal gets the brand colour');
select throws_ok($$select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                   '{"display_name":"G","short_bio":"b","release_accepted":true,"release_signed_name":"G",
                     "custom_answers":["not an object"]}')$$,
                 '22023', null, 'answers must be an object');
select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  jsonb_build_object('display_name', 'G', 'short_bio', 'b', 'release_accepted', true, 'release_signed_name', 'G',
                     'custom_answers', jsonb_build_object(
                       (select id::text from public.custom_fields where label = 'Topic?'), 'AI')));
reset role;
select is((select s.custom_answers ->> f.id::text
           from public.submissions s, public.custom_fields f
           where f.label = 'Topic?' and s.episode_guest_id = 'ea000000-0000-0000-0000-000000000000'),
          'AI', 'answers are saved with the submission');

-- ---------------------------------------------------------------------------
-- Phase 10: extra guest files
-- ---------------------------------------------------------------------------
create function pg_temp.submit_with_assets(p_assets jsonb) returns void language sql as $$
  select public.submit_onboarding('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_object('display_name', 'G', 'short_bio', 'b', 'release_accepted', true,
                       'release_signed_name', 'G', 'assets', p_assets));
$$;
insert into storage.objects (bucket_id, name, metadata) values
  ('guest-assets', '0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/kit.pdf',
   '{"mimetype": "application/pdf", "size": 2048}'),
  ('guest-assets', '0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/fake.pdf',
   '{"mimetype": "text/html", "size": 10}');

set local role service_role;
select throws_ok($$select pg_temp.submit_with_assets('{"media_kit": {"path": "0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/kit.pdf"}}')$$,
                 '22023', null, 'a file kind the workspace did not request is rejected');
reset role;
update public.organizations set requested_assets = '{media_kit}' where id = '0a000000-0000-0000-0000-000000000000';
set local role service_role;
select throws_ok($$select pg_temp.submit_with_assets('{"media_kit": {"path": "0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/fake.pdf"}}')$$,
                 '22023', null, 'a file whose stored type does not match its kind is rejected');
select throws_ok($$select pg_temp.submit_with_assets('{"media_kit": {"path": "0b000000-0000-0000-0000-000000000000/x/kit.pdf"}}')$$,
                 '22023', null, 'a file outside the booking''s folder is rejected');
select lives_ok($$select pg_temp.submit_with_assets('{"media_kit": {"path": "0a000000-0000-0000-0000-000000000000/ea000000-0000-0000-0000-000000000000/kit.pdf", "file_name": "Press kit.pdf"}}')$$,
                'a requested file is saved');
reset role;
select results_eq($$select file_name, content_type, size_bytes from public.submission_assets$$,
                  $$values ('Press kit.pdf'::text, 'application/pdf'::text, 2048::bigint)$$,
                  'type and size come from the stored object');

select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select throws_ok($$delete from public.submission_assets$$, '42501', null, 'hosts cannot change guest files directly');
reset role;

-- ---------------------------------------------------------------------------
-- Phase 11: plan tiers
-- ---------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select throws_ok($$update public.organizations set plan = 'pro' where id = '0a000000-0000-0000-0000-000000000000'$$,
                 '42501', null, 'signed-in users cannot change the plan');
select lives_ok($$select public.create_invitation('0a000000-0000-0000-0000-000000000000', 'dan@example.com')$$,
                'no plan (billing off): no seat limit');
reset role;

set local role service_role;
select is(public.apply_stripe_subscription('0a000000-0000-0000-0000-000000000000', 'cus_a', 'sub_a', 'price_s',
                                            'active', now() + interval '30 days', false, now(), 'starter'),
          '0a000000-0000-0000-0000-000000000000'::uuid, 'the webhook records the plan');
reset role;
select is((select plan from public.organizations where id = '0a000000-0000-0000-0000-000000000000'),
          'starter', 'the plan is stored');

select pg_temp.login('a0000000-0000-0000-0000-000000000000', 'alice@example.com');
set local role authenticated;
select throws_ok($$select public.create_invitation('0a000000-0000-0000-0000-000000000000', 'erin@example.com')$$,
                 '53400', null, 'Starter: members plus pending invitations are capped at 2 seats');
select lives_ok($$insert into public.episodes (organization_id, title)
                  select '0a000000-0000-0000-0000-000000000000', 'Ep ' || n from generate_series(2, 5) n$$,
                'Starter: up to 5 new episodes a month');
select throws_ok($$insert into public.episodes (organization_id, title)
                   values ('0a000000-0000-0000-0000-000000000000', 'Ep 6')$$,
                 '53400', null, 'Starter: the 6th episode in a month is refused');
select is((public.org_plan_usage('0a000000-0000-0000-0000-000000000000') ->> 'episodes_this_month')::int,
          5, 'usage counts this month''s episodes');
reset role;

select pg_temp.login('b0000000-0000-0000-0000-000000000000', 'bob@example.com');
set local role authenticated;
select is(public.org_plan_usage('0a000000-0000-0000-0000-000000000000'), null,
          'other workspaces cannot read usage');
reset role;
update public.organizations set plan = null where id = '0a000000-0000-0000-0000-000000000000';

-- Accepting an invitation at the seat limit works (its pending seat becomes the member).
update public.organizations set plan = 'starter' where id = '0b000000-0000-0000-0000-000000000000';
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000000', 'frank@example.com');
select pg_temp.login('b0000000-0000-0000-0000-000000000000', 'bob@example.com');
set local role authenticated;
create temp table invite_token as
  select public.create_invitation('0b000000-0000-0000-0000-000000000000', 'frank@example.com') as token;
reset role;
select pg_temp.login('f0000000-0000-0000-0000-000000000000', 'frank@example.com');
set local role authenticated;
select lives_ok($$select public.accept_invitation((select token from invite_token))$$,
                'an invitation can be accepted when it holds the last seat');
reset role;
select is((select count(*)::int from public.organization_members
           where organization_id = '0b000000-0000-0000-0000-000000000000'), 2, 'the workspace now uses both seats');

-- ---------------------------------------------------------------------------
-- Phase 12: recording scheduling
-- ---------------------------------------------------------------------------
insert into public.guests (id, organization_id, full_name) values
  ('90a20000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'Guest A2');
insert into public.episode_guests (id, organization_id, episode_id, guest_id, token_hash, token_expires_at) values
  ('ea200000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000',
   'e0a00000-0000-0000-0000-000000000000', '90a20000-0000-0000-0000-000000000000',
   public.hash_token('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), now() + interval '1 day');
insert into public.episodes (id, organization_id, title) values
  ('e0a20000-0000-0000-0000-000000000000', '0a000000-0000-0000-0000-000000000000', 'Other episode');

select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select lives_ok($$insert into public.recording_slots (organization_id, episode_id, starts_at, duration_minutes) values
                  ('0a000000-0000-0000-0000-000000000000', 'e0a00000-0000-0000-0000-000000000000', now() + interval '2 days', 45),
                  ('0a000000-0000-0000-0000-000000000000', 'e0a00000-0000-0000-0000-000000000000', now() + interval '3 days', 45),
                  ('0a000000-0000-0000-0000-000000000000', 'e0a00000-0000-0000-0000-000000000000', now() - interval '1 day', 45),
                  ('0a000000-0000-0000-0000-000000000000', 'e0a20000-0000-0000-0000-000000000000', now() + interval '2 days', 45)$$,
                'members can offer recording times');
select throws_ok($$update public.recording_slots set episode_guest_id = 'ea000000-0000-0000-0000-000000000000'
                   where episode_id = 'e0a00000-0000-0000-0000-000000000000'$$,
                 '42501', null, 'hosts cannot assign a time to a guest');
reset role;

select pg_temp.login('b0000000-0000-0000-0000-000000000000', 'bob@example.com');
set local role authenticated;
select is((select count(*)::int from public.recording_slots), 0, 'other workspaces cannot see recording times');
reset role;

create temp table slot_ids as
  select (select id from public.recording_slots where episode_id = 'e0a00000-0000-0000-0000-000000000000'
          and starts_at > now() order by starts_at limit 1) as first_slot,
         (select id from public.recording_slots where episode_id = 'e0a00000-0000-0000-0000-000000000000'
          and starts_at > now() order by starts_at desc limit 1) as second_slot,
         (select id from public.recording_slots where starts_at < now()) as past_slot,
         (select id from public.recording_slots where episode_id = 'e0a20000-0000-0000-0000-000000000000') as other_slot;
grant select on slot_ids to service_role;

set local role service_role;
select is(jsonb_array_length(public.get_onboarding_context('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') -> 'slots'),
          2, 'the portal lists the episode''s open future times only');
select lives_ok($$select public.pick_recording_slot('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', (select first_slot from slot_ids))$$,
                'a guest can pick an open time');
select throws_ok($$select public.pick_recording_slot('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', (select first_slot from slot_ids))$$,
                 '23505', null, 'a taken time cannot be picked by another guest');
select throws_ok($$select public.pick_recording_slot('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', (select past_slot from slot_ids))$$,
                 'P0002', null, 'a past time cannot be picked');
select throws_ok($$select public.pick_recording_slot('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', (select other_slot from slot_ids))$$,
                 'P0002', null, 'a time on another episode cannot be picked');
select is(jsonb_array_length(public.get_onboarding_context('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') -> 'slots'),
          1, 'other guests no longer see a taken time');
select public.pick_recording_slot('guest-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', (select second_slot from slot_ids));
reset role;
select results_eq($$select episode_guest_id from public.recording_slots where id = (select first_slot from slot_ids)
                    union all
                    select episode_guest_id from public.recording_slots where id = (select second_slot from slot_ids)$$,
                  $$values (null::uuid), ('ea000000-0000-0000-0000-000000000000'::uuid)$$,
                  'picking another time frees the first');

delete from public.episode_guests where id = 'ea000000-0000-0000-0000-000000000000';
select results_eq($$select episode_guest_id, booked_at from public.recording_slots where id = (select second_slot from slot_ids)$$,
                  $$values (null::uuid, null::timestamptz)$$, 'removing a booking frees its time');

select pg_temp.login('c0000000-0000-0000-0000-000000000000', 'carol@example.com');
set local role authenticated;
select throws_ok($$select public.pick_recording_slot('guest-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', (select second_slot from slot_ids))$$,
                 '42501', null, 'signed-in users cannot call the portal scheduling functions');
reset role;

-- ---------------------------------------------------------------------------
-- Phase 9: account deletion
-- ---------------------------------------------------------------------------
select throws_ok($$delete from auth.users where id = 'a0000000-0000-0000-0000-000000000000'$$,
                 '23514', null, 'the last owner of a workspace with other members cannot be deleted');
delete from auth.users where id = 'c0000000-0000-0000-0000-000000000000';
select is((select count(*)::int from public.organization_members
           where user_id = 'c0000000-0000-0000-0000-000000000000'),
          0, 'deleting a member''s account removes their memberships');

select * from finish();
rollback;
