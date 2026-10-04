-- =============================================================================
-- Phase 1: reserved org slugs + invitation preview
-- =============================================================================

-- Org dashboards live at /<slug>. Top-level app routes always win over the
-- dynamic segment, so an org with one of these slugs would be unreachable.
-- Keep in sync with RESERVED_SLUGS in src/schemas/organization.ts.
alter table public.organizations
  add constraint organizations_slug_not_reserved check (
    slug not in (
      'about', 'account', 'admin', 'api', 'app', 'auth', 'billing', 'blog',
      'dashboard', 'docs', 'help', 'invite', 'login', 'logout', 'new',
      'onboarding', 'pricing', 'privacy', 'settings', 'signup', 'static',
      'submit', 'support', 'terms', 'www'
    )
  );

-- Lets a signed-in user see what they're accepting before they accept it.
-- Holding the raw token is the capability, the same as accept_invitation().
-- Returns NULL for unknown, used, or expired tokens.
create function public.get_invitation_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_name', o.name,
    'organization_slug', o.slug,
    'email',             i.email,
    'role',              i.role,
    'invited_by',        coalesce(p.full_name, p.email),
    'expires_at',        i.expires_at
  )
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where (select auth.uid()) is not null
    and p_token is not null
    and char_length(p_token) between 32 and 128
    and i.token_hash = public.hash_token(p_token)
    and i.accepted_at is null
    and i.expires_at > now();
$$;

revoke execute on function public.get_invitation_preview(text) from public, anon;
grant execute on function public.get_invitation_preview(text) to authenticated;
