# Litbook

Guest booking, onboarding and asset management for podcasters. Hosts book a
guest onto an episode and send them a secure link. The guest submits their bio,
headshot, social links and a signed release, with no account and no email
back-and-forth.

- [Architecture and project structure](docs/ARCHITECTURE.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Database migrations](supabase/migrations/)

**Stack:** Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn/ui,
Supabase (Postgres with RLS, Auth, Storage), Zod, Stripe.

## Local development

Requirements: Node 22, pnpm, Docker.

```bash
pnpm install
pnpm db:start              # local Supabase: Postgres, Auth, Storage, Mailpit
cp .env.example .env.local # then paste the publishable and secret keys printed by db:start
pnpm dev                   # http://localhost:3000
```

Sign-in emails don't leave your machine. Open Mailpit at
http://127.0.0.1:54324 to click your magic link.

| Command                   | What it does                                         |
| ------------------------- | ---------------------------------------------------- |
| `pnpm lint` / `typecheck` | ESLint, TypeScript                                   |
| `pnpm test`               | Unit tests (Vitest)                                  |
| `pnpm test:e2e`           | End-to-end tests (Playwright; needs `db:start`)      |
| `pnpm db:test`            | RLS and privilege tests (pgTAP)                      |
| `pnpm db:reset`           | Rebuild the local database from migrations           |
| `pnpm db:types`           | Regenerate `src/types/database.ts` after a migration |
| `pnpm format`             | Prettier                                             |

### Optional

- **Google sign-in:** enable `[auth.external.google]` in `supabase/config.toml`,
  set the `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` variables, and set
  `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
- **Invite emails:** set `RESEND_API_KEY`. Without it, the inviter is shown the
  invite link to share.
