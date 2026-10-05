# Litbook — Implementation Roadmap

Each phase ends with something you can deploy and demo. Phases 0–4 make up the
MVP; billing (Phase 5) is wired in before launch.

## Phase 0: Foundation ✅

- `create-next-app` (TypeScript, App Router, Tailwind, `src/`), shadcn/ui init,
  ESLint + Prettier, Vitest, Playwright.
- `supabase init`, apply the initial migration locally, and generate
  `src/types/database.ts`.
- `lib/env.ts` (Zod-validated env), the three Supabase clients, and
  `proxy.ts` session refresh (Next 16 renamed middleware to proxy).
- CI: format, lint, typecheck, unit tests, build; then `supabase db lint`,
  `supabase test db`, a generated-types drift check, and Playwright E2E.

**Done when:** `pnpm dev` runs against local Supabase and CI is green.

## Phase 1: Auth and tenancy ✅

- Email magic link (`/auth/confirm`, token-hash, works across browsers) and
  Google OAuth (`/auth/callback`, behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`).
- `/onboarding`: create the first org through `create_organization()`.
- `(app)/[orgSlug]/layout.tsx`: resolve the org and membership, or 404. Add the
  org switcher.
- Team settings: invite (`create_invitation()` plus a transactional email
  through Resend or Postmark), accept at `/invite/[token]`, change role, remove,
  leave.
- `lib/safe-action.ts` wrapper.
- Reserved org slugs, plus `get_invitation_preview()` so the invite page shows
  who's inviting you before you accept.
- **E2E:** sign up, create a workspace, invite, the teammate joins through a
  magic link, role limits, single-use invites, the last-owner guard, and
  cross-tenant 404s.
- **pgTAP tests:** user A can never read or write org B's rows, and anon
  sees nothing.

**Done when:** two users in different orgs can't see each other's data, and an
invited teammate can.

## Phase 2: Episodes and guests ✅

- Episode CRUD with a list (status filter, sorted by recording date,
  paginated) and a detail page. Dates are entered and shown in the viewer's
  time zone.
- Guest directory CRUD with search, and email dedupe per org (booking a "new"
  guest whose email is already in the directory reuses that guest).
- Book a guest onto an episode (`episode_guests`), with a status badge on each
  booking. Cancel, restore, or remove a booking; a booking with a signed
  release can only be cancelled, never deleted.
- "Get link": `issue_onboarding_token()`, then a dialog with the copyable
  `/submit/<token>` URL (shown once; "New link" asks first, then rotates it).
- Dashboard: upcoming recordings and counts by status.
- Migration `20261004020000`: `created_by` is always the signed-in user, and
  hosts can only cancel/restore booking status (no faking a submission).

**Done when:** a host can create an episode, book a guest, and copy their link.

## Phase 3: Guest onboarding portal ✅

- `/submit/[token]`: loads through `get_onboarding_context()` and shows a
  friendly "link isn't working" page for unknown, expired, rotated, or
  cancelled links. Marked `noindex` and `Referrer-Policy: no-referrer`.
- `OnboardingForm` (react-hook-form + the shared Zod schema): name, headline,
  short and long bio, pronouns, pronunciation, website (normalised to
  https), social links.
- `HeadshotDropzone`: client-side type and size check, a server action mints a
  signed upload URL, the browser uploads directly, then a preview is shown. A
  replaced headshot is deleted; `submit_onboarding()` checks the file exists.
- Release: the org's release text, an "I agree" checkbox, and a typed-name
  signature (re-signed on every save; IP, user agent, version and text
  snapshot recorded).
- Submit through `submit_onboarding()` and redirect to `/submit/[token]/done`.
  Guests can come back and edit until the booking is marked ready.
- Rate limits per link and per IP, in Postgres (`check_rate_limit()`), so
  there's no extra infrastructure. Opening a link is recorded for the host.
- Email the teammate who booked the guest (or the owners) when a guest
  submits, sent after the response with `after()`.

## Phase 4: Asset Vault and export ✅

- Booking page (`/[orgSlug]/bookings/[bookingId]`): copy buttons for the
  headline and each bio, clickable social handles (resolved to profile URLs,
  http(s) only), and headshot preview plus download (a signed URL with
  `download` set, expiring after 60 seconds).
- The host can fix typos in the guest's content (release fields stay
  read-only), and "Mark ready" locks guest edits; "Reopen" unlocks them.
- Export: "Copy show notes" per guest and per episode, and a per-episode ZIP
  of headshots plus a `guests.md`, streamed from a route handler with fflate.
- Release record on the booking page and a PDF download (pdf-lib), with the
  signer, timestamp, version, IP and browser.

## Phase 5: Stripe billing ✅

- Litbook Pro at $29/mo (`STRIPE_PRICE_ID`), with a `STRIPE_TRIAL_DAYS`
  trial (default 14) that needs no card up front. Billing is off entirely
  when `STRIPE_SECRET_KEY` isn't set.
- `startCheckout`: creates the Stripe customer (idempotency key per org) and
  saves `stripe_customer_id`, using `client_reference_id = org.id` and
  `subscription_data.metadata.organization_id`. An org with a live
  subscription is sent to the portal instead, so it can't subscribe twice.
- `/api/webhooks/stripe`: verifies the signature, skips events already in
  `stripe_events`, applies `checkout.session.completed` and
  `customer.subscription.*` through `apply_stripe_subscription()` (which
  ignores events older than the last one applied), then records the event.
  A failure returns 500 so Stripe retries. Structured JSON logs.
- Customer Portal for plan changes, payment details and cancellation.
- Creating episodes and onboarding links needs `org_has_active_subscription()`
  (3 days' grace after the period ends). Reading and exporting always work.
- Billing page: status, trial/renewal date, scheduled cancellation, and a
  past-due banner across the app.
- Workspace deletion (owners, type-to-confirm): cancels the subscription,
  removes stored files, then deletes the org. Deleting episodes, guests and
  bookings now removes their files too.

## Phase 6: Hardening and launch ✅

- Playwright E2E across the whole journey: sign up, create an org, book a
  guest, guest submits on a phone, host reviews, exports and downloads,
  billing-off state, workspace deletion, and cross-tenant 404s.
- Observability: `instrumentation.ts` logs every server error as one JSON
  line (tokens redacted), webhooks log structured events, and `/api/health`
  checks the database. Sentry can be plugged into `onRequestError`.
- Security: a nonce-based CSP with `strict-dynamic` on every page (no
  violations under E2E), `nosniff`, `X-Frame-Options`, a Permissions-Policy,
  HSTS on https, no `X-Powered-By`, and `robots.txt`. `server-only` audit done.
  pgTAP checks that every table has RLS, and that `anon` has no table or
  function privileges, for every future migration too.
- Deployment: [docs/DEPLOYMENT.md](DEPLOYMENT.md), and a `Deploy database`
  workflow that runs `supabase db push` after CI passes on `main`.

## Phase 7: Emailed links and guest reminders ✅

- "Email link" on a booking issues a fresh link and emails it to the guest,
  with replies going to the host. Without email configured, the host gets
  the link to send themselves.
- Automatic reminders (`/api/cron/reminders`, daily via Vercel Cron, behind
  `CRON_SECRET`): up to two, three days apart, only for still-pending
  bookings whose link Litbook emailed. Workspaces can turn them off.
- Raw tokens are still never stored. `claim_onboarding_reminders()` claims
  due bookings with `SKIP LOCKED`; each reminder carries a server-generated
  link that `set_onboarding_token()` applies only after the email was
  delivered, so a failed send never breaks a working link.
- Local development and CI deliver all email (invites, links, reminders,
  host notifications) to Mailpit, so E2E tests read real emails.

## Phase 8: Guest page branding and custom questions ✅

- Settings → Guest page: logo (public `org-branding` bucket, owners and
  admins only, PNG/JPG/WebP up to 2 MB), brand colour (re-themes buttons,
  focus rings and checkboxes with a readable text colour) and a welcome
  message. A live preview shows the result.
- Settings → Guest questions: short answer, paragraph, link, multiple choice
  and checkbox questions, optional or required, reorderable. Questions are
  archived rather than deleted, so earlier answers keep their label. The
  answer type is fixed once created (column grants enforce it).
- Answers are validated against the questions the guest was shown, on the
  client and again on the server, and stored in `submissions.custom_answers`.
  They appear in the vault and in the episode export's `guests.md`.

## Phase 9: Data export and account deletion (GDPR) ✅

- Settings → Data and privacy (owners and admins): one streamed ZIP with
  every record as JSON (organization, members, invitations, episodes,
  guests, bookings, submissions with release evidence, questions) and
  every uploaded file. Token hashes never leave the database.
- Guest page → Export data: everything held about one guest (record,
  bookings, answers, signed releases as PDFs, files), for subject access
  requests. Deleting a guest already removes their rows and files.
- `/account`: profile, workspaces, "Download my data" (JSON) and "Delete my
  account". Deleting removes the user from every workspace and deletes
  workspaces where they're the only member (cancelling any subscription and
  removing files). It's blocked while they're the last owner of a
  workspace with other members, in the app and by the existing
  keep-an-owner trigger.

## Post-MVP backlog

- Calendar booking (guest picks a recording slot), plus Google Calendar and
  Zoom or Riverside links.
- Custom domain for the guest portal.
- Multiple asset types: intro audio, company logos, pre-interview questionnaire.
- Plan tiers: seats, episodes per month.
