# Soap & Squeegee (soapandsqueegee.com)

Affiliate content site: guides and tools for starting a pressure washing or
window cleaning business. Built with Next.js; hosted on Vercel.

- Articles: `content/guides/*.md`
- Affiliate links: `data/links.ts` (all outbound product links go through `/go/<slug>`)
- Site settings (name, author, email): `lib/site.ts`
- Price calculator rates: `lib/pricing.ts`

## Run locally
    npm install
    npm run dev
