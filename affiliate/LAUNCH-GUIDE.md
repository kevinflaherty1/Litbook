# Launch Guide: Get SoapAndSqueegee.com Live

The site's code is in `affiliate/site/`. These steps put it online for free on
Vercel and connect your domain. Allow about 45 minutes. Do them in order.

## 1. Set up your email (10 min)
The site lists **hello@soapandsqueegee.com**. Make it work for free:
- **Porkbun:** Domain Management → your domain → Email Forwarding → forward
  `hello@` to your personal inbox.
- **Cloudflare:** Email → Email Routing → add `hello@` → your inbox.
Use this address (not your personal one) for affiliate applications and free trials.

## 2. Put the site on Vercel (15 min)
1. Go to vercel.com and sign up with your GitHub account (free Hobby plan).
2. **Add New → Project →** import the `Litbook` repository.
3. **Before clicking Deploy**, set:
   - **Root Directory:** `affiliate/site` (click Edit next to it)
   - Framework preset: Next.js (should auto-detect)
4. Click **Deploy**. You'll get a free `something.vercel.app` address. Open it and
   click around.
5. **Branch:** the site currently lives on the branch `claude/castport-saas-setup-1pebfs`.
   Either merge it into `main`, or in Vercel go to Settings → Git → Production
   Branch and set it to that branch. Ask me if you're unsure.
6. Optional: in Settings → Git → **Ignored Build Step**, use
   `git diff --quiet HEAD^ HEAD -- .` so the site only rebuilds when files in
   `affiliate/site` change.

> Note: the hobby plan is for non-commercial use. Once the site earns money,
> Vercel's terms require the Pro plan (about $20/mo), or you can move to
> Cloudflare Pages or Netlify, which allow commercial use on free tiers. We'll
> handle that when the first commission arrives.

## 3. Connect your domain (10 min + waiting)
1. In Vercel: Project → Settings → **Domains** → add `soapandsqueegee.com`.
   Also add `www.soapandsqueegee.com` and let it redirect to the main domain.
2. Vercel shows you DNS records (usually an **A record** and a **CNAME**). Add
   exactly what it shows at your registrar's DNS settings.
3. Wait (minutes to a few hours). Vercel turns the domain green and adds HTTPS
   automatically.

## 4. Tell Google and Bing the site exists (10 min)
1. **Google Search Console** (search.google.com/search-console) → Add property →
   **Domain** → verify with the TXT record it gives you (add it in DNS).
2. Sitemaps → submit `https://soapandsqueegee.com/sitemap.xml`.
3. **Bing Webmaster Tools** → "Import from Google Search Console" (one click).

## 5. Analytics (optional, 5 min)
In Vercel → your project → **Analytics** → Enable (free tier). It's privacy-friendly
and doesn't need a cookie banner.

## Affiliate links
All product links go through `/go/<name>`, defined in `site/data/links.ts`.
They currently point to normal vendor homepages (no commission). When a program
approves you, send me the affiliate link and I'll swap it in. Every article
updates at once.

## Adding articles
Articles are Markdown files in `site/content/guides/`. I'll draft them, you
review, and once they're pushed Vercel publishes automatically.
