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

## Phase 2: Episodes and guests (2–3 days)

- Episode CRUD with a list (status filter, sorted by recording date) and a
  detail page.
- Guest directory CRUD, with email dedupe per org.
- Book a guest onto an episode (`episode_guests`), with a status badge on each
  booking.
- "Generate link": `issue_onboarding_token()`, then a dialog with the
  copyable `/submit/<token>` URL (shown once; regenerating rotates it).
- Dashboard: upcoming recordings and counts by status.

**Done when:** a host can create an episode, book a guest, and copy their link.

## Phase 3: Guest onboarding portal (3–4 days)

- `/submit/[token]`: loads through `get_onboarding_context()` and calls
  `notFound()` on an invalid link.
- `OnboardingForm` (react-hook-form + the shared Zod schema): name, headline,
  short and long bio, pronouns, pronunciation, website, social links.
- `HeadshotDropzone`: client-side type and size check, a server action mints a
  signed upload URL, the browser uploads directly, then a preview is shown.
- `ReleaseSignature`: shows the org's release text, plus a "type your full
  name" field and an "I agree" checkbox.
- Submit through `submit_onboarding()` and redirect to `/submitted`. Guests can
  come back and edit until the booking is marked ready.
- Rate-limit portal actions per token and IP (for example with Upstash).
- Email the host when a guest submits.

**Done when:** a guest with only the link can complete onboarding on mobile.

## Phase 4: Asset Vault and export (2 days)

- Guest and booking detail: copy buttons for each bio length and the
  headline, clickable social handles, and headshot preview and download (a
  signed URL with `download` set, expiring after 60 seconds).
- The host can fix typos in the guest's content (release fields stay
  read-only), and "Mark ready" locks guest edits.
- Export: "Copy show notes" as a formatted text block, and a per-episode ZIP
  of headshots plus a `guests.md` (built server-side and streamed).
- Release form view and PDF download for records.

**Done when:** a host can go from a booking to show-notes-ready assets in a
few clicks.

## Phase 5: Stripe billing (2 days)

- Products: Litbook Pro at $29/mo, with a trial set in Stripe.
- `createCheckoutSession`: creates the Stripe customer and saves
  `stripe_customer_id`, using `client_reference_id = org.id`.
- `/api/webhooks/stripe`: verify the signature, then insert into
  `stripe_events` (skip duplicates), then upsert billing columns on
  `checkout.session.completed` and `customer.subscription.created`,
  `customer.subscription.updated`, and `customer.subscription.deleted`.
- Customer Portal for plan changes and cancellation.
- Gate _create_ actions (new episode, generate link) with
  `org_has_active_subscription()`. Reading and exporting always stay allowed.
- Billing page: status, renewal date, and a past-due banner.

**Done when:** test-mode checkout turns an org active, and cancelling turns
it back.

## Phase 6: Hardening and launch (2–3 days)

- Playwright E2E: sign up, create an org, book a guest, guest submits, host
  downloads.
- Error and observability: Sentry, and structured logs in webhooks and the
  portal.
- Security pass: CSP headers, `server-only` audit, Supabase advisors, RLS test
  coverage for every table.
- Deploy to Vercel with Supabase prod. Run migrations through CI
  (`supabase db push`).

## Post-MVP backlog

- Calendar booking (guest picks a recording slot), plus Google Calendar and
  Zoom or Riverside links.
- Custom form fields per org, and custom branding and domain for the portal.
- Automated reminders to guests who haven't submitted.
- Multiple asset types: intro audio, company logos, pre-interview questionnaire.
- Plan tiers: seats, episodes per month.
- Account-deletion flow and data export (GDPR).
