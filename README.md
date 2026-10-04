# Litbook

Guest booking, onboarding and asset management for podcasters. Hosts book a
guest onto an episode and send them a secure link. The guest submits their bio,
headshot, social links and a signed release, with no account and no email
back-and-forth.

- [Architecture and project structure](docs/ARCHITECTURE.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [Database schema and RLS](supabase/migrations/20261004000000_initial_schema.sql)

**Stack:** Next.js (App Router, TypeScript), Tailwind + shadcn/ui, Supabase
(Postgres with RLS, Auth, Storage), Zod, Stripe.
