# Litbook — Architecture

Litbook is a multi-tenant guest booking and onboarding portal for podcasters.
Hosts book a guest onto an episode, send them a unique link, and get back a bio,
headshot, social links and a signed release form, with no email back-and-forth.

## Stack

| Concern    | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Framework  | Next.js (App Router, Server Components, Server Actions), TypeScript |
| UI         | Tailwind CSS + shadcn/ui                                            |
| DB / Auth  | Supabase Postgres + Supabase Auth, RLS keyed on `organization_id`   |
| Storage    | Supabase Storage, private bucket, signed upload/download URLs       |
| Validation | Zod schemas shared by the client forms and the server actions       |
| Billing    | Stripe Checkout + Customer Portal + webhooks                        |

## Data model

```
auth.users 1─1 profiles ─┐
                         │ N
organizations 1─N organization_members N─1 profiles
      │       1─N organization_invitations
      │       1─N custom_fields          (guest questions; archived, never deleted)
      │       1─N episodes ──┬──1─N recording_slots (offered times; ≤1 guest each)
      │       1─N guests ────┤
      │                      ▼
      └──────1─N episode_guests  (a booking: guest X on episode Y)
                     │  token_hash, status, expiry
                     ├──1─N submission_assets (logo, intro audio, media kit)
                     1
                     │
                     1
                 submissions     (bio, socials, headshot_path, custom_answers,
                                  signed release)
```

`organizations` also holds branding (`logo_path`, `brand_color`,
`portal_welcome`), the files it requests (`requested_assets`) and its plan
(`plan`, set by the Stripe webhook; limits in `public.plan_limits()`).

- **`guests` is an org-level directory**, so one person can appear on many
  episodes. The **booking** (`episode_guests`) owns the onboarding link and its
  status (`pending → assets_submitted → ready`, or `cancelled`).
- **Composite foreign keys** `(organization_id, id)` mean a booking can't link
  one tenant's episode to another tenant's guest, even if a bug lets the wrong
  IDs through.
- **Signed release evidence** (signer name, timestamp, IP, user agent, form
  version, and a snapshot of the exact text) is stored on the submission and
  can't be changed by any authenticated user.

Migrations: [`supabase/migrations/`](../supabase/migrations/), starting with
[`20261004000000_initial_schema.sql`](../supabase/migrations/20261004000000_initial_schema.sql).
Each later phase adds one migration.

## Security model

| Caller          | What it can do                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `anon`          | **Nothing.** No table grants, no function grants.                                                                                  |
| `authenticated` | Rows where `is_org_member(organization_id)`. Billing columns, tokens, and release evidence are write-protected with column grants. |
| `service_role`  | Server-only: Stripe webhook, guest portal RPCs, signed upload URLs.                                                                |

**Guest portal flow (`/submit/[token]`):**

1. The host clicks "Generate link". `issue_onboarding_token()` returns a
   256-bit random token **once**. Only its SHA-256 hash is stored, so a
   database leak doesn't expose working links. Generating a new link
   invalidates the old one.
2. The guest opens the link. A Server Component calls
   `get_onboarding_context(token)` with the service-role client. It returns
   `null` for unknown, expired, or cancelled links, which renders `notFound()`.
3. Headshot upload: a server action re-checks the token, then mints a signed
   upload URL for `guest-assets/<org_id>/<booking_id>/<uuid>.<ext>`. The
   browser uploads straight to Storage, so the file never passes through
   Next.js.
4. Submit: a server action validates with Zod and calls
   `submit_onboarding(token, payload, ip, ua)`. In one transaction, that
   function rechecks the token, requires the release signature, checks that the
   headshot path is under this booking's prefix, upserts the submission, and
   sets the status to `assets_submitted`.
5. When the host marks a booking `ready`, the guest can no longer edit.

Portal actions are rate-limited per link and per IP through
`check_rate_limit()` (service_role only). The portal pages send
`Referrer-Policy: no-referrer` and `noindex`, because the URL is the
credential.

**Rules that keep tenancy safe:**

- Never trust a client-supplied `organization_id`. Server actions resolve the
  active org from the route segment (`/[orgSlug]/…`) and membership, and RLS
  checks it again.
- `lib/supabase/admin.ts` (service role) is imported only from `server-only`
  modules: the portal, webhooks, and upload signing.
- The billing gate (`org_has_active_subscription`) runs in server actions that
  **create** things, never in RLS. A lapsed customer can still read and export
  their data.

## Project structure

```
litbook/
├── supabase/
│   ├── config.toml                      # local stack; auth URLs, email templates, Google
│   ├── migrations/                      # never edit an applied migration; add a new one
│   ├── templates/                       # magic-link / confirmation emails → /auth/confirm
│   └── tests/database/
│       └── rls_tenancy.test.sql         # pgTAP: tenancy, privileges, RPCs (pnpm db:test)
│
├── src/
│   ├── proxy.ts                         # Next 16 "proxy" (formerly middleware): CSP nonce,
│   │                                    # refresh session cookie, redirect signed-out users
│   ├── instrumentation.ts               # onRequestError → structured JSON logs
│   ├── app/
│   │   ├── layout.tsx                   # <html>, fonts, <Toaster/>
│   │   ├── page.tsx                     # landing page
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── auth/
│   │   │       ├── callback/route.ts    # OAuth (PKCE ?code=) exchange
│   │   │       └── confirm/route.ts     # magic link (token_hash) verification
│   │   ├── dashboard/page.tsx           # post-login redirect → first org or /onboarding
│   │   ├── onboarding/page.tsx          # create a workspace
│   │   ├── invite/[token]/page.tsx      # preview + accept team invitation
│   │   │
│   │   ├── (app)/[orgSlug]/             # authenticated, tenant-scoped
│   │   │   ├── layout.tsx               # resolves org + membership (404 if not a member)
│   │   │   ├── page.tsx                 # overview / getting-started checklist
│   │   │   ├── settings/page.tsx        # workspace, release form, your profile
│   │   │   ├── settings/team/page.tsx   # members, roles, invitations
│   │   │   ├── episodes/                # list (status filter), new, [episodeId] (bookings + links)
│   │   │   ├── guests/                  # directory (search), [guestId]
│   │   │   ├── bookings/[bookingId]/    # Asset Vault: assets, fix typos, release; /headshot, /release (PDF)
│   │   │   ├── episodes/[episodeId]/export/  # streamed ZIP: headshots + guests.md
│   │   │   └── settings/billing/        # plan status, checkout, Customer Portal
│   │   │
│   │   ├── submit/[token]/              # PUBLIC guest portal: form, /done, friendly 404
│   │   ├── api/webhooks/stripe/         # signature check → apply_stripe_subscription()
│   │   ├── api/cron/reminders/          # daily guest reminders (CRON_SECRET)
│   │   └── api/health/                  # uptime check
│   │
│   ├── features/                        # domain modules: actions, queries, UI
│   │   ├── auth/                        # magic link, OAuth, sign out; AuthForm
│   │   ├── organizations/               # create/update org, release form; requireOrgMembership
│   │   ├── team/                        # invite, accept, roles, remove/leave, profile
│   │   ├── episodes/                    # episode CRUD, dashboard queries
│   │   ├── guests/                      # guest directory CRUD
│   │   ├── bookings/                    # book guests, links, cancel/restore, ready, vault, release PDF
│   │   ├── portal/                      # token context, headshot upload, submit, host email
│   │   ├── billing/                     # checkout, portal, webhook handling, paywall gate
│   │
│   ├── components/
│   │   ├── ui/                          # shadcn/ui primitives (Radix + CVA)
│   │   └── shared/                      # sidebar, org switcher, user menu, Field, CopyButton…
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts                # cookie-bound client: RLS as the signed-in user
│   │   │   ├── client.ts                # browser client
│   │   │   ├── admin.ts                 # service role (server-only) — portal/webhooks only
│   │   │   └── proxy.ts                 # updateSession() used by src/proxy.ts
│   │   ├── auth.ts                      # getCurrentUser / requireUser (per-request cached)
│   │   ├── safe-action.ts               # authedAction / orgAction wrappers (server-only)
│   │   ├── action-result.ts             # ActionResult type, ok() / fail() (client-safe)
│   │   ├── forms.ts                     # map ActionResult errors onto react-hook-form
│   │   ├── env.ts / env.server.ts       # Zod-validated public / server-only env
│   │   ├── email.ts                     # Resend; Mailpit in dev/CI; logs when unconfigured
│   │   ├── redirect.ts                  # safeNextPath(): open-redirect guard
│   │   ├── rate-limit.ts                # Postgres-backed rate limits + request IP/UA
│   │   ├── route-auth.ts                # org access for route handlers (404 otherwise)
│   │   ├── stripe.ts                    # Stripe client, billingEnabled, subscription mapping
│   │   ├── storage.ts                   # removeStoragePrefix(): file cleanup after deletes
│   │   ├── social.ts / show-notes.ts    # profile URLs; show notes + guests.md formatting
│   │   └── errors.ts                    # Postgres SQLSTATE helpers
│   │
│   ├── schemas/                         # Zod, shared by client + server
│   │   ├── auth.ts
│   │   ├── organization.ts              # slug rules + reserved slugs (mirrors DB)
│   │   ├── team.ts
│   │   └── episode.ts / guest.ts / booking.ts
│   │
│   └── types/database.ts                # generated: pnpm db:types (CI fails on drift)
│
├── tests/
│   ├── unit/                            # Vitest: schemas, redirect guard, formatting
│   ├── integration/                     # Vitest against local Supabase: webhook, storage
│   └── e2e/                             # Playwright against local Supabase + Mailpit
│
├── .github/workflows/
│   ├── ci.yml                           # checks, pgTAP, integration, E2E
│   └── deploy-database.yml              # supabase db push after CI passes on main
├── .env.example
├── components.json                      # shadcn config
└── playwright.config.ts / vitest.config.mts
```

### Conventions

- **Feature folders own their server actions.** Every action is wrapped in
  `authedAction` or `orgAction` (`lib/safe-action.ts`): require a user, parse
  input with Zod, and for org actions verify membership and role from `orgId`.
  Handlers call Supabase, `refresh()` the page, and return
  `{ ok, data } | { ok: false, error, fieldErrors }`. Unexpected errors are
  logged and become a generic message; `redirect()` passes through.
- **Org URLs are `/<slug>`.** App routes like `/login` take precedence over the
  dynamic segment, so those words are reserved slugs, enforced by both Zod and
  a DB check constraint (a unit test keeps the two lists in sync).
- **Reads happen in Server Components** through `features/*/queries.ts` with the
  cookie-bound client, so RLS always applies.
- **Zod limits mirror the DB `check` constraints.** The DB is the backstop; Zod
  gives the user friendly errors.
- **Times** are stored as `timestamptz` and shown with `LocalDateTime`, which
  formats in the viewer's time zone without a hydration flash (inline script,
  per the Next.js "preventing flash" guide). `DateTimeInput` converts
  `datetime-local` values to ISO in the browser.
- **Types** are regenerated from the database after every migration
  (`pnpm db:types`). CI regenerates them and fails if the committed file differs.
