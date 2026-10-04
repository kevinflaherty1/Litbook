# Litbook — Architecture

Litbook is a multi-tenant guest booking and onboarding portal for podcasters.
Hosts book a guest onto an episode, send them a unique link, and get back a bio,
headshot, social links and a signed release form, with no email back-and-forth.

## Stack

| Concern    | Choice                                                         |
| ---------- | -------------------------------------------------------------- |
| Framework  | Next.js (App Router, Server Components, Server Actions), TypeScript |
| UI         | Tailwind CSS + shadcn/ui                                       |
| DB / Auth  | Supabase Postgres + Supabase Auth, RLS keyed on `organization_id` |
| Storage    | Supabase Storage, private bucket, signed upload/download URLs  |
| Validation | Zod schemas shared by the client forms and the server actions  |
| Billing    | Stripe Checkout + Customer Portal + webhooks                   |

## Data model

```
auth.users 1─1 profiles ─┐
                         │ N
organizations 1─N organization_members N─1 profiles
      │       1─N organization_invitations
      │       1─N episodes ──┐
      │       1─N guests ────┤
      │                      ▼
      └──────1─N episode_guests  (a booking: guest X on episode Y)
                     │  token_hash, status, expiry
                     1
                     │
                     1
                 submissions     (bio, socials, headshot_path, signed release)
```

* **`guests` is an org-level directory**, so one person can appear on many
  episodes. The **booking** (`episode_guests`) owns the onboarding link and its
  status (`pending → assets_submitted → ready`, or `cancelled`).
* **Composite foreign keys** `(organization_id, id)` mean a booking can't link
  one tenant's episode to another tenant's guest, even if a bug lets the wrong
  IDs through.
* **Signed release evidence** (signer name, timestamp, IP, user agent, form
  version, and a snapshot of the exact text) is stored on the submission and
  can't be changed by any authenticated user.

Migration: [`supabase/migrations/20261004000000_initial_schema.sql`](../supabase/migrations/20261004000000_initial_schema.sql)

## Security model

| Caller          | What it can do                                                                 |
| --------------- | ------------------------------------------------------------------------------ |
| `anon`          | **Nothing.** No table grants, no function grants.                             |
| `authenticated` | Rows where `is_org_member(organization_id)`. Billing columns, tokens, and release evidence are write-protected with column grants. |
| `service_role`  | Server-only: Stripe webhook, guest portal RPCs, signed upload URLs.            |

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

**Rules that keep tenancy safe:**

* Never trust a client-supplied `organization_id`. Server actions resolve the
  active org from the route segment (`/[orgSlug]/…`) and membership, and RLS
  checks it again.
* `lib/supabase/admin.ts` (service role) is imported only from `server-only`
  modules: the portal, webhooks, and upload signing.
* The billing gate (`org_has_active_subscription`) runs in server actions that
  **create** things, never in RLS. A lapsed customer can still read and export
  their data.

## Project structure

```
litbook/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 20261004000000_initial_schema.sql
│   ├── seed.sql                         # local dev fixtures
│   └── tests/                           # pgTAP RLS tests (supabase test db)
│       └── rls_tenancy.test.sql
│
├── src/
│   ├── middleware.ts                    # refresh Supabase session; guard (app) routes
│   │
│   ├── app/
│   │   ├── layout.tsx                   # <html>, fonts, <Toaster/>
│   │   ├── globals.css
│   │   ├── (marketing)/                 # public site
│   │   │   ├── page.tsx                 # landing
│   │   │   └── pricing/page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── auth/callback/route.ts   # OAuth / magic-link code exchange
│   │   ├── invite/[token]/page.tsx      # accept team invitation
│   │   ├── onboarding/page.tsx          # first org creation
│   │   │
│   │   ├── (app)/[orgSlug]/             # authenticated, tenant-scoped
│   │   │   ├── layout.tsx               # resolves org + membership, sidebar, org switcher
│   │   │   ├── page.tsx                 # dashboard: upcoming recordings, status counts
│   │   │   ├── episodes/
│   │   │   │   ├── page.tsx             # list + filters
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [episodeId]/
│   │   │   │       ├── page.tsx         # detail; book guests; copy onboarding links
│   │   │   │       └── edit/page.tsx
│   │   │   ├── guests/
│   │   │   │   ├── page.tsx             # guest directory
│   │   │   │   └── [guestId]/page.tsx   # Asset Vault: bios, socials, headshot download
│   │   │   └── settings/
│   │   │       ├── page.tsx             # org profile, release form text
│   │   │       ├── team/page.tsx        # members, roles, invitations
│   │   │       └── billing/page.tsx     # plan, Checkout / Customer Portal
│   │   │
│   │   ├── submit/[token]/              # PUBLIC guest portal (no auth)
│   │   │   ├── page.tsx
│   │   │   ├── submitted/page.tsx
│   │   │   └── actions.ts               # createHeadshotUploadUrl, submitOnboarding
│   │   │
│   │   └── api/
│   │       └── webhooks/stripe/route.ts # signature verify → idempotent upsert
│   │
│   ├── features/                        # domain modules: actions, queries, UI
│   │   ├── organizations/
│   │   │   ├── actions.ts               # createOrganization, updateOrganization
│   │   │   ├── queries.ts               # getOrgBySlug, requireMembership
│   │   │   └── components/
│   │   ├── team/
│   │   │   ├── actions.ts               # inviteMember, changeRole, removeMember
│   │   │   └── components/
│   │   ├── episodes/
│   │   │   ├── actions.ts
│   │   │   ├── queries.ts
│   │   │   └── components/              # EpisodeForm, EpisodeTable, StatusBadge
│   │   ├── guests/
│   │   │   ├── actions.ts               # createGuest, bookGuest, issueLink, markReady
│   │   │   ├── queries.ts
│   │   │   └── components/              # BookingRow, CopyLinkButton, AssetVaultCard
│   │   ├── portal/
│   │   │   └── components/              # OnboardingForm, HeadshotDropzone, ReleaseSignature
│   │   └── billing/
│   │       ├── actions.ts               # createCheckoutSession, createPortalSession
│   │       ├── plans.ts                 # price IDs → plan limits
│   │       └── webhook-handlers.ts
│   │
│   ├── components/
│   │   ├── ui/                          # shadcn/ui (generated)
│   │   └── shared/                      # AppSidebar, OrgSwitcher, EmptyState, CopyButton
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts                # createServerClient (cookies) — RLS as user
│   │   │   ├── client.ts                # createBrowserClient
│   │   │   ├── admin.ts                 # service role — `import "server-only"`
│   │   │   └── middleware.ts            # updateSession helper
│   │   ├── stripe.ts
│   │   ├── env.ts                       # Zod-validated process.env
│   │   ├── safe-action.ts               # action wrapper: auth → Zod → typed result
│   │   ├── storage.ts                   # key builders, signed URL helpers
│   │   └── utils.ts                     # cn(), formatters
│   │
│   ├── schemas/                         # Zod, shared by client + server
│   │   ├── organization.ts
│   │   ├── episode.ts
│   │   ├── guest.ts
│   │   └── submission.ts                # social link URL rules, bio limits mirror DB checks
│   │
│   └── types/
│       └── database.ts                  # `supabase gen types typescript` output
│
├── tests/
│   ├── unit/                            # Vitest: schemas, helpers
│   └── e2e/                             # Playwright: signup → book → guest submit
│
├── .env.example
├── components.json                      # shadcn config
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Conventions

* **Feature folders own their server actions.** Every action follows the same
  pipeline in `lib/safe-action.ts`: get the user, resolve and authorize the
  org, parse input with Zod, call Supabase, `revalidatePath`, and return
  `{ ok, data } | { ok: false, error }`.
* **Reads happen in Server Components** through `features/*/queries.ts` with the
  cookie-bound client, so RLS always applies.
* **Zod limits mirror the DB `check` constraints.** The DB is the backstop; Zod
  gives the user friendly errors.
* **Types** are regenerated from the database after every migration
  (`supabase gen types typescript --local > src/types/database.ts`).
