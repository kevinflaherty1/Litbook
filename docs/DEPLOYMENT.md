# Deploying Litbook

Litbook runs on **Vercel** (the Next.js app) and **Supabase** (Postgres, Auth,
Storage). Stripe and Resend are optional until you want billing and email.

## 1. Supabase

1. Create a project. Note the project ref, database password, URL,
   publishable key (`sb_publishable_…`) and secret key (`sb_secret_…`).
2. Apply the migrations from your machine once (CI does it afterwards):

   ```bash
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push
   ```

   This also creates the private `guest-assets` bucket and its policies.

3. **Authentication → URL configuration**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/**`
4. **Authentication → Email templates.** Paste `supabase/templates/magic_link.html`
   into "Magic link" and `supabase/templates/confirmation.html` into "Confirm
   signup". This matters: the app verifies `token_hash` links at
   `/auth/confirm`, which is what makes magic links work when opened in a
   different browser. (`supabase/config.toml` only configures the local stack.)
5. **Authentication → SMTP.** Use your own SMTP provider (Resend works). The
   built-in sender is heavily rate-limited.
6. Optional, Google sign-in: enable the provider with your OAuth client and
   add `https://<project>.supabase.co/auth/v1/callback` as an authorized
   redirect in Google Cloud.
7. Run **Advisors → Security** and **Performance** in the dashboard and
   resolve anything they flag.

## 2. Vercel

Import the repository and set these environment variables (Production, and
Preview if you use a separate Supabase project for previews):

| Variable                               | Value                                          |
| -------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | `https://<your-domain>` (no trailing slash)    |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`                             |
| `SUPABASE_SECRET_KEY`                  | `sb_secret_…` (server only)                    |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`      | `true` if you enabled Google                   |
| `RESEND_API_KEY`, `EMAIL_FROM`         | Invites and "guest submitted" emails           |
| `STRIPE_SECRET_KEY`                    | `sk_live_…` (turns billing and the paywall on) |
| `STRIPE_WEBHOOK_SECRET`                | `whsec_…` from the webhook endpoint below      |
| `STRIPE_PRICE_PRO`                     | Pro's recurring price ($29/month)              |
| `STRIPE_PRICE_STARTER`                 | Optional: Starter's price ($12/month)          |
| `STRIPE_TRIAL_DAYS`                    | Optional, default `14`                         |

`vercel.json` schedules `/api/cron/reminders` daily at 15:00 UTC; Vercel
sends `CRON_SECRET` as a bearer token. Never set `MAILPIT_URL` in production.

The site sends HSTS when `NEXT_PUBLIC_SITE_URL` is `https://`. Point a log
drain at Axiom, Datadog or similar: server errors and webhook events are
logged as one JSON object per line, with portal and invite tokens redacted.

## 3. Stripe

1. Create two products: "Litbook Pro" with a $29/month recurring price
   (`STRIPE_PRICE_PRO`) and "Litbook Starter" with a $12/month price
   (`STRIPE_PRICE_STARTER`; leave it unset to sell Pro only). The webhook
   maps each subscription's price to its plan; limits live in
   `public.plan_limits()` and `src/lib/plans.ts`. `STRIPE_PRICE_ID` from
   before plan tiers still works as Pro.
2. **Developers → Webhooks → Add endpoint**: `https://<your-domain>/api/webhooks/stripe`
   with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`
3. **Settings → Billing → Customer portal**: enable it, allow cancelling and
   updating payment methods, and under "Subscriptions" allow switching
   between the Starter and Pro prices (that's how customers change plan).
4. Test end to end in test mode: start a trial from Settings → Billing,
   check the workspace shows "Free trial", then cancel in the portal and
   check it shows "Cancelled" once the period ends.

## 4. GitHub Actions

`CI` runs on every push and PR. `Deploy database` applies migrations to
production after CI passes on `main`. Add these secrets, and required
reviewers on the `production` environment if you want a manual gate:

- `SUPABASE_ACCESS_TOKEN`: a personal access token from Supabase
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

Migrations are append-only: never edit one that has been applied; add a new
file in `supabase/migrations/`.

## 5. After deploying

- `GET /api/health` returns `{"ok":true}`. Point your uptime monitor at it.
- Sign up, create a workspace, book a guest, open their link in a private
  window, and submit with a headshot.
- Confirm the "guest submitted" email arrives (with Resend configured).
