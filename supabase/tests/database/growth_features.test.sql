-- Phases 8+: branding, custom questions, and later additions.
-- Run with: pnpm db:test  (supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
